import {
  eventTarget,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type {
  RenderingConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';
import type { SegmentationRenderedEventDetail } from '../../types/EventTypes';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities/triggerAnnotationRenderForViewportIds';
import { Events, SegmentationRepresentations } from '../../enums';
import {
  triggerSegmentationModified,
  triggerSegmentationDataModified,
} from './triggerSegmentationEvents';
import { addColorLUT } from './addColorLUT';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { addDefaultSegmentationListener } from './segmentationEventManager';
import { getActiveSegmentIndex, setActiveSegmentIndex } from './segmentIndex';

/**
 * Tracks segmentations that already have a pending "data modified after render"
 * trigger scheduled, so multiple representation additions for the same
 * segmentation (e.g. a labelmap in a 2D viewport and a surface in a 3D viewport)
 * result in a single trigger.
 */
const pendingRenderTriggers = new Set<string>();

/**
 * Schedules a single triggerSegmentationDataModified for the segmentation once
 * its representation has rendered (i.e. the viewport actors exist).
 *
 * Triggering synchronously during the add runs before the actors exist and does
 * not complete the visual refresh, while triggering it from more than one place
 * runs the conversion twice for the same change. Waiting for a single render and
 * coalescing per segmentation keeps it to one trigger after the actors are in
 * place.
 */
function scheduleSegmentationDataModifiedAfterRender(segmentationId: string) {
  if (pendingRenderTriggers.has(segmentationId)) {
    return;
  }

  pendingRenderTriggers.add(segmentationId);

  const onSegmentationRendered = (
    event: CustomEvent<SegmentationRenderedEventDetail>
  ) => {
    if (event.detail?.segmentationId !== segmentationId) {
      return;
    }

    eventTarget.removeEventListener(
      Events.SEGMENTATION_RENDERED,
      onSegmentationRendered as EventListener
    );
    pendingRenderTriggers.delete(segmentationId);

    triggerSegmentationDataModified(segmentationId);
  };

  eventTarget.addEventListener(
    Events.SEGMENTATION_RENDERED,
    onSegmentationRendered as EventListener
  );
}

function internalAddSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
) {
  const { segmentationId, config } = representationInput;

  // need to be able to override from the outside
  const renderingConfig: RenderingConfig = {
    colorLUTIndex: getColorLUTIndex(config),
    ...config,
  };

  defaultSegmentationStateManager.addSegmentationRepresentation(
    viewportId,
    segmentationId,
    representationInput.type,
    renderingConfig
  );

  const { viewport } = getEnabledElementByViewportId(viewportId) || {};

  if (viewport) {
    addDefaultSegmentationListener(
      viewport,
      segmentationId,
      representationInput.type
    );
  }

  // Initialize the active segment index to the first available segment if none is currently set
  if (!getActiveSegmentIndex(segmentationId)) {
    let firstSegmentIndex = 1;
    const segmentation =
      defaultSegmentationStateManager.getSegmentation(segmentationId);

    if (segmentation) {
      const segmentKeys = Object.keys(segmentation.segments);
      if (segmentKeys.length > 0) {
        firstSegmentIndex = segmentKeys.map((k) => Number(k)).sort()[0];
      }
      setActiveSegmentIndex(segmentationId, firstSegmentIndex);
    }
  }

  if (representationInput.type === SegmentationRepresentations.Contour) {
    triggerAnnotationRenderForViewportIds([viewportId]);
  }

  scheduleSegmentationDataModifiedAfterRender(segmentationId);
  triggerSegmentationModified(segmentationId);
}

/**
 * Retrieves or adds a Color Lookup Table (LUT) index based on the provided configuration.
 *
 * @param config - Configuration object containing colorLUTOrIndex.
 * @returns The index of the Color LUT to be used.
 */
function getColorLUTIndex(config: RepresentationPublicInput['config']): number {
  // Destructure colorLUTOrIndex from the config, with a fallback to undefined if config is undefined
  const { colorLUTOrIndex } = config || {};

  // If no colorLUTOrIndex provided, get next available index and add default LUT
  if (colorLUTOrIndex === undefined) {
    const index = addColorLUT(
      JSON.parse(JSON.stringify(CORNERSTONE_COLOR_LUT))
    );
    return index;
  }

  // If numeric index provided, return it directly
  if (typeof colorLUTOrIndex === 'number') {
    return colorLUTOrIndex;
  }

  // If colorLUTOrIndex is a ColorLUT array, add it with a new index
  if (
    Array.isArray(colorLUTOrIndex) &&
    colorLUTOrIndex.every((item) => Array.isArray(item) && item.length === 4)
  ) {
    const index = addColorLUT(colorLUTOrIndex);
    return index;
  }

  // Fallback: use default LUT with next available index
  const index = addColorLUT(JSON.parse(JSON.stringify(CORNERSTONE_COLOR_LUT)));
  return index;
}

export { internalAddSegmentationRepresentation };
