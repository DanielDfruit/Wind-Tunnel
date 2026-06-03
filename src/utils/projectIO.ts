import type { ProjectFile } from '../types/simulationTypes';

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(data: unknown): ProjectFile | null {
  if (!data || typeof data !== 'object') return null;
  const p = data as ProjectFile;
  if (p.version !== 1) return null;
  return p;
}
