/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-11 00:04:58
 * @Last Modified by: qiuz
 */

const globalData: Record<string, any> = {}

const setGlobalData = (key: string, val: any) => {
    globalData[key] = val
}

const getGlobalData = (key: string) => {
    return globalData[key]
}

export { getGlobalData, setGlobalData }
