import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Vlastní kopie `cn` — Workspace nezávisí na lib/utils.ts adminu.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
