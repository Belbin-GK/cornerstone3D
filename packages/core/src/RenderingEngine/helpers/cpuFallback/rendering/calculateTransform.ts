import { Transform } from './transform';
import { sanitizePixelSpacing } from './validator';
import type {
  CPUFallbackEnabledElement,
  CPUFallbackTransform,
} from '../../../../types';

/**
 * Calculate the transform for a Cornerstone enabled element
 *
 * @param enabledElement - The Cornerstone Enabled Element
 * @param scale - The viewport scale
 * @returns The current transform
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  scale?: number
): CPUFallbackTransform {
  const transform = new Transform();
  const aspectRatio = enabledElement.viewport.aspectRatio;

  if (!enabledElement.viewport.displayedArea) {
    return transform;
  }

  // Move to center of canvas
  transform.translate(
    enabledElement.canvas.width / 2,
    enabledElement.canvas.height / 2
  );

  // Apply the rotation before scaling for non square pixels
  const angle = enabledElement.viewport.rotation;

  if (angle !== 0) {
    transform.rotate((angle * Math.PI) / 180);
  }

  // Apply the scale
  let widthScale = enabledElement.viewport.scale;
  let heightScale = enabledElement.viewport.scale;

  const width =
    enabledElement.viewport.displayedArea.brhc.x -
    (enabledElement.viewport.displayedArea.tlhc.x - 1);
  const height =
    enabledElement.viewport.displayedArea.brhc.y -
    (enabledElement.viewport.displayedArea.tlhc.y - 1);

  if (enabledElement.viewport.displayedArea.presentationSizeMode === 'NONE') {
    const rowPixelSpacing = sanitizePixelSpacing(
      enabledElement.image.rowPixelSpacing
    );
    const columnPixelSpacing = sanitizePixelSpacing(
      enabledElement.image.columnPixelSpacing
    );

    if (rowPixelSpacing < columnPixelSpacing) {
      widthScale *= columnPixelSpacing / rowPixelSpacing;
    } else if (columnPixelSpacing < rowPixelSpacing) {
      heightScale *= rowPixelSpacing / columnPixelSpacing;
    }
  } else {
    const rowPixelSpacing = sanitizePixelSpacing(
      enabledElement.viewport.displayedArea.rowPixelSpacing
    );
    const columnPixelSpacing = sanitizePixelSpacing(
      enabledElement.viewport.displayedArea.columnPixelSpacing
    );

    // These should be good for "TRUE SIZE" and "MAGNIFY"
    widthScale = columnPixelSpacing;
    heightScale = rowPixelSpacing;

    if (
      enabledElement.viewport.displayedArea.presentationSizeMode ===
      'SCALE TO FIT'
    ) {
      // Fit TRUE IMAGE image (width/height) to window
      const verticalScale =
        enabledElement.canvas.height / (height * heightScale);
      const horizontalScale =
        enabledElement.canvas.width / (width * widthScale);

      // Apply new scale
      widthScale = heightScale = Math.min(horizontalScale, verticalScale);

      if (rowPixelSpacing < columnPixelSpacing) {
        widthScale *= columnPixelSpacing / rowPixelSpacing;
      } else if (columnPixelSpacing < rowPixelSpacing) {
        heightScale *= rowPixelSpacing / columnPixelSpacing;
      }
    }
  }

  transform.scale(widthScale, heightScale);

  // Unrotate to so we can translate unrotated
  if (angle !== 0) {
    transform.rotate((-angle * Math.PI) / 180);
  }

  // Apply the pan offset
  transform.translate(
    enabledElement.viewport.translation.x,
    enabledElement.viewport.translation.y
  );

  // Rotate again so we can apply general scale
  if (angle !== 0) {
    transform.rotate((angle * Math.PI) / 180);
  }

  if (scale !== undefined && aspectRatio === undefined) {
    // Apply the font scale
    transform.scale(scale, scale);
  }

  if (aspectRatio !== undefined && scale === undefined) {
    const [scaleX, scaleY] = aspectRatio;
    transform.scale(scaleX, scaleY);
  }

  // Apply Flip if required
  if (enabledElement.viewport.hflip) {
    transform.scale(-1, 1);
  }

  if (enabledElement.viewport.vflip) {
    transform.scale(1, -1);
  }

  // Move back from center of image
  transform.translate(-width / 2, -height / 2);

  return transform;
}
