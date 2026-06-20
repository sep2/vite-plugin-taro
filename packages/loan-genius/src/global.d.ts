declare namespace NodeJS {
    interface ProcessEnv {
        TARO_ENV: 'weapp' | 'h5'
    }
}

declare const IS_H5: boolean
declare const IS_WEAPP: boolean
