import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  encodeImageIdInfo,
  createViewports,
} from '../../../utils/test/testUtils';

const { utilities, Enums, eventTarget, volumeLoader, setVolumesForViewports } =
  cornerstone3D;

const { Events, ViewportType } = Enums;

const { PlanarFreehandROITool, annotation, Enums: csToolsEnums } = csTools3d;

const { Events: csToolsEvents, ChangeTypes } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

// 64 x 64 image, 1mm spacing, with a 255 vertical bar in columns 10-14 and 0
// everywhere else. Index and world coordinates are the same for this image.
const imageInfo = {
  loader: 'fakeImageLoader',
  name: 'imageURI',
  rows: 64,
  columns: 64,
  barStart: 10,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
};

// 64 x 64 x 5 volume, 1mm spacing. Slice k has a 255 bar in columns
// 12k to 12k + 11, so neighbouring slices have different values.
const volumeInfo = {
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 64,
  columns: 64,
  slices: 5,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
};
const volumeBarWidth = Math.floor(volumeInfo.rows / volumeInfo.slices);

// The layouts the same annotation is measured in. The statistics must not
// depend on viewport size, zoom or pan, so every layout must report the same
// values. The last two show the image at less than one canvas pixel per voxel,
// which is where sampling canvas pixels misses voxels.
const layouts = [
  { name: 'stack layout', width: 512, height: 512, zoom: 1 },
  { name: 'advanced layout', width: 200, height: 160, zoom: 1 },
  {
    name: 'zoomed and panned',
    width: 300,
    height: 300,
    zoom: 1.7,
    pan: [3.3, -2.1],
  },
  {
    name: 'zoomed out',
    width: 200,
    height: 160,
    zoom: 0.3,
    belowOnePixelPerVoxel: true,
  },
  {
    name: 'small and zoomed out',
    width: 128,
    height: 128,
    zoom: 0.4,
    pan: [0.37, 0.61],
    belowOnePixelPerVoxel: true,
  },
];

/** A closed rectangle contour, as a polyline in world coordinates. */
function rectanglePolyline(xMin, xMax, yMin, yMax, z) {
  return [
    [xMin, yMin, z],
    [xMax, yMin, z],
    [xMax, yMax, z],
    [xMin, yMax, z],
  ];
}

/** A closed, many-sided contour with slanted edges, in world coordinates. */
function circlePolyline(centerX, centerY, radius, z, numPoints = 60) {
  return Array.from({ length: numPoints }, (_, i) => {
    const angle = (2 * Math.PI * i) / numPoints;
    return [
      centerX + radius * Math.cos(angle),
      centerY + radius * Math.sin(angle),
      z,
    ];
  });
}

/**
 * Brute-force reference: the statistics of every pixel of the 2D image whose
 * centre is inside the polygon, using a plain ray-casting test.
 */
function expectedStatsForPolygon(polyline, columns, rows, valueAt) {
  const isInside = (x, y) => {
    let inside = false;
    for (let a = 0, b = polyline.length - 1; a < polyline.length; b = a++) {
      const [xa, ya] = polyline[a];
      const [xb, yb] = polyline[b];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) {
        inside = !inside;
      }
    }
    return inside;
  };

  const values = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      if (isInside(i, j)) {
        values.push(valueAt(i, j));
      }
    }
  }

  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;

  return {
    count,
    mean,
    stdDev: Math.sqrt(variance),
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function getCount(stats) {
  return stats.statsArray.find(({ name }) => name === 'count')?.value;
}

/** Canvas pixels covered by one voxel along x at the current camera. */
function getPixelsPerVoxel(viewport) {
  const { focalPoint } = viewport.getCamera();
  const start = viewport.worldToCanvas(focalPoint);
  const end = viewport.worldToCanvas([
    focalPoint[0] + 1,
    focalPoint[1],
    focalPoint[2],
  ]);
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function addFreehandAnnotation(viewport, polyline) {
  const freehandAnnotation = PlanarFreehandROITool.createAnnotationForViewport(
    viewport,
    {
      data: {
        contour: { polyline, closed: true },
      },
    }
  );

  return annotation.state.addAnnotation(freehandAnnotation, viewport.element);
}

function waitForEvent(element, eventName) {
  return new Promise((resolve) => {
    element.addEventListener(eventName, resolve, { once: true });
  });
}

/**
 * Resizes and moves the viewport to match a layout, the way switching between
 * the stack and advanced layouts does.
 */
function applyLayout(renderingEngine, viewport, layout) {
  const { element } = viewport;
  element.style.width = `${layout.width}px`;
  element.style.height = `${layout.height}px`;

  renderingEngine.resize(true, false);

  viewport.setZoom(layout.zoom);
  if (layout.pan) {
    viewport.setPan(layout.pan);
  }
}

/**
 * Clears the annotation's cached statistics, re-renders, and resolves with
 * the statistics the tool calculates for the current camera.
 *
 * Waits for ANNOTATION_MODIFIED with StatsUpdated rather than
 * ANNOTATION_RENDERED, which the tool only fires while a contour is being
 * drawn or edited.
 */
function recalculateStats(viewport, annotationUID) {
  const freehandAnnotation = annotation.state.getAnnotation(annotationUID);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      eventTarget.removeEventListener(
        csToolsEvents.ANNOTATION_MODIFIED,
        onModified
      );
      reject(
        new Error('Timed out waiting for the statistics to be calculated')
      );
    }, 3000);

    function onModified(evt) {
      const { annotation: modified, changeType } = evt.detail;
      if (
        modified.annotationUID !== annotationUID ||
        changeType !== ChangeTypes.StatsUpdated
      ) {
        return;
      }

      clearTimeout(timeout);
      eventTarget.removeEventListener(
        csToolsEvents.ANNOTATION_MODIFIED,
        onModified
      );
      resolve(Object.values(freehandAnnotation.data.cachedStats)[0]);
    }

    eventTarget.addEventListener(csToolsEvents.ANNOTATION_MODIFIED, onModified);

    freehandAnnotation.data.cachedStats = {};
    freehandAnnotation.invalidated = true;
    viewport.render();
  });
}

/** Measures the annotation in every layout and returns the statistics. */
async function measureInEveryLayout(renderingEngine, viewport, annotationUID) {
  const results = [];

  for (const layout of layouts) {
    applyLayout(renderingEngine, viewport, layout);

    if (layout.belowOnePixelPerVoxel) {
      // Make sure the layout really shows more than one voxel per canvas pixel.
      expect(getPixelsPerVoxel(viewport))
        .withContext(layout.name)
        .toBeLessThan(1);
    }

    const stats = await recalculateStats(viewport, annotationUID);
    results.push({ layout, stats });
  }

  return results;
}

function expectStats(results, expected) {
  results.forEach(({ layout, stats }) => {
    expect(getCount(stats)).withContext(layout.name).toBe(expected.count);
    expect(stats.mean).withContext(layout.name).toBeCloseTo(expected.mean, 6);
    expect(stats.stdDev)
      .withContext(layout.name)
      .toBeCloseTo(expected.stdDev, 6);
    expect(stats.max).withContext(layout.name).toBe(expected.max);
    expect(stats.min).withContext(layout.name).toBe(expected.min);
  });
}

describe('PlanarFreehandROITool closed contour statistics:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
      tools: [PlanarFreehandROITool],
      toolActivations: {
        [PlanarFreehandROITool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    annotation.state.removeAllAnnotations();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
      cleanupDOMElements: true,
    });
  });

  describe('in a stack viewport', () => {
    let viewport;

    beforeEach(async function () {
      createViewports(renderingEngine, {
        viewportType: ViewportType.STACK,
        width: 512,
        height: 512,
        viewportId,
      });

      viewport = renderingEngine.getViewport(viewportId);

      const rendered = waitForEvent(viewport.element, Events.IMAGE_RENDERED);
      viewport.setStack([encodeImageIdInfo(imageInfo)], 0);
      renderingEngine.render();
      await rendered;
    });

    it('measures exactly the pixels inside the contour in every layout', async function () {
      // Edges on pixel boundaries: columns 8-16 and rows 21-39 are inside
      // (9 x 19 = 171 pixels), and columns 10-14 of them are the 255 bar.
      const annotationUID = addFreehandAnnotation(
        viewport,
        rectanglePolyline(7.5, 16.5, 20.5, 39.5, 0)
      );

      const results = await measureInEveryLayout(
        renderingEngine,
        viewport,
        annotationUID
      );

      const fraction = 5 / 9;
      expectStats(results, {
        count: 171,
        mean: 255 * fraction,
        stdDev: 255 * Math.sqrt(fraction * (1 - fraction)),
        max: 255,
        min: 0,
      });
    });

    it('reports the same statistics in every layout for a contour with slanted edges', async function () {
      const polyline = circlePolyline(12.4, 31.7, 9.3, 0);
      const annotationUID = addFreehandAnnotation(viewport, polyline);

      const results = await measureInEveryLayout(
        renderingEngine,
        viewport,
        annotationUID
      );

      const { barStart, barWidth, columns, rows } = imageInfo;
      expectStats(
        results,
        expectedStatsForPolygon(polyline, columns, rows, (i) =>
          i >= barStart && i < barStart + barWidth ? 255 : 0
        )
      );
    });
  });

  describe('in a volume (MPR) viewport', () => {
    let viewport;
    let sliceIndex;

    beforeEach(async function () {
      createViewports(renderingEngine, {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        width: 512,
        height: 512,
        viewportId,
      });

      viewport = renderingEngine.getViewport(viewportId);

      const volumeId = testUtils.encodeVolumeIdInfo(volumeInfo);
      await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

      const rendered = waitForEvent(viewport.element, Events.IMAGE_RENDERED);
      await setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId]
      );
      viewport.render();
      await rendered;

      // Origin 0 and 1mm spacing, so the focal point's z is the slice index.
      sliceIndex = viewport.getCamera().focalPoint[2];
      expect(Number.isInteger(sliceIndex)).toBe(true);
    });

    it('measures only the voxels of the current slice inside the contour in every layout', async function () {
      // Columns 3 before to 5 after the start of this slice's bar, rows 21-39:
      // 9 x 19 = 171 voxels, 6 x 19 of them in the bar. The neighbouring
      // slices have their bars elsewhere, so any voxel taken from them
      // changes the result.
      const barStart = sliceIndex * volumeBarWidth;
      const annotationUID = addFreehandAnnotation(
        viewport,
        rectanglePolyline(
          barStart - 3.5,
          barStart + 5.5,
          20.5,
          39.5,
          sliceIndex
        )
      );

      const results = await measureInEveryLayout(
        renderingEngine,
        viewport,
        annotationUID
      );

      const fraction = 6 / 9;
      expectStats(results, {
        count: 171,
        mean: 255 * fraction,
        stdDev: 255 * Math.sqrt(fraction * (1 - fraction)),
        max: 255,
        min: 0,
      });
    });
  });
});
