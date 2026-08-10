import path from 'node:path'
import { packageRequire } from '../../utils/packages.ts'

export const tailwindcssBasedir = path.dirname(packageRequire.resolve('tailwindcss/package.json'))
