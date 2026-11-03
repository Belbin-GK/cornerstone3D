import type { SegmentationRepresentations } from '../../enums';
import addRepresentationData from '../../stateManagement/segmentation/internalAddRepresentationData';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';

/**
 * Computes a segmentation representation and subscribes to future segmentation updates.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param type - Representation type (e.g., LABELMAP, CONTOUR).
 * @param computeFunction - Async function that computes representation data.
 * @param onComputationComplete - Optional callback invoked after computation completes.
 * @returns - A promise that resolves with the computed representation data,
 *   or undefined if the segmentation was removed while computing.
 */
async function computeAndAddRepresentation<T>(
  segmentationId: string,
  type: SegmentationRepresentations,
  computeFunction: () => Promise<T>,
  onComputationComplete?: () => void
): Promise<T | undefined> {
  // Compute the specific representation data
  const data = await computeFunction();

  // The segmentation may have been removed while computing
  if (!getSegmentation(segmentationId)) {
    return;
  }

  // Add the computed data to the system
  addRepresentationData({
    segmentationId,
    type,
    data,
  });

  onComputationComplete?.();

  return data;
}

export { computeAndAddRepresentation };
