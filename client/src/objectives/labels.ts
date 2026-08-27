import type { ObjectivePublic } from '@15-seconds/shared';

export function objectiveLabel(obj: ObjectivePublic): string {
  return `${obj.title} (${obj.progress}/${obj.target})`;
}
