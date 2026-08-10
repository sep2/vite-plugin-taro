import { createStyleHandler } from '@weapp-tailwindcss/postcss'

export const wxStyleOptions = {
    cssCalc: false,
    autoprefixer: false,
    rem2rpx: true,
    px2rpx: true
} as const

/** Shared finalization policy for complete builds and host-owned style HMR. */
export const transformWxStyle = createStyleHandler(wxStyleOptions)
