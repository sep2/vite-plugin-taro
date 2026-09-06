/*
 * @Author: qiuz
 * @Github: <https://github.com/qiuziz>
 * @Date:  2020-12-09 13:42:01
 * @Last Modified by: qiuz
 */

import Taro from 'virtual:taro/api'
import { Button, Input, ScrollView, Text, View } from 'virtual:taro/components'
import { BoxShadow, NavigationBar } from '@components'
import { formatFloat, getStorageData, isAndroid, setGlobalData } from '@utils'
import { useCallback, useRef, useState } from 'react'
import LoanGeniusHeader from './compute-header'
import {
    COMPUTE_WAY,
    COMPUTE_WAY_TITLE,
    getRenderList as createRenderList,
    LIST_TYPE,
    LOAN_WAY_TITLE,
    OPTION
} from './constants'
import { equalInterestCalc } from './helper'
import { LineWrap } from './line-wrap'
import { TitleTpl } from './title-tpl'

function createInitialState() {
    const { price = 0 } = Taro.getCurrentInstance().router!.params
    return {
        // 计算结果显示
        showResult: false,
        // 月付
        equalPrincipalPayMonth: 0,
        equalInterestPayMonth: 0,
        // 用户优先贷款方式
        userLoanWay: '等额本息',
        // 计算方式
        way: price ? 1 : 0,
        // 贷款方式 loanType + 1 = 1: 组合贷款  2: 商业贷款  3：公积金贷款
        loanType: 1,
        // 表单渲染项
        renderList: [],
        // 配置项
        options: {},
        // 参数
        params: {
            // 房屋总价
            houseTotal: price || 0,
            // 首付百分比
            downPayRate: 30,
            // 贷款金额
            loanAmount: 0,
            // 公积金金额
            accumulatTotalPirce: 0,
            // 公积金贷款上限
            accumulatLoanLimit: 0,
            // 基点
            commercialLoanBasePoint: 0,
            // 商贷利率
            commerceLoanRate: 0,
            // 公积金利率
            publicReserveFundsRate: 0,
            // 商贷年限
            commercialLoanTerm: 0,
            // 商贷利率方式
            commercialLoanWay: 0,
            // 商贷金额
            commerceTotalPirce: 0
        },
        // 默认值
        defaultValue: {},
        keyboardHeight: -1,
        // 利率方式, 1 最新 | 0 旧版
        loanLrpType: 1,
        downPayRateCustom: '',
        // 安卓上 手动输入时 隐藏计算按钮
        btnOpacity: 1,
        // 安卓状态栏
        backgroundColor: '#fff'
    }
}

export default function LoanGenius() {
    const [state, setReactState] = useState<any>(createInitialState)
    const stateRef = useRef(state)
    const loadingRef = useRef(false)
    const scrollRef = useRef<unknown>(null)
    const computeResultRef = useRef<object>({})
    const isFirstChangeRef = useRef(true)

    stateRef.current = state

    const setState = useCallback((partial: Record<string, any>, callback?: () => void) => {
        const nextState = {
            ...stateRef.current,
            ...partial
        }
        stateRef.current = nextState
        setReactState(nextState)
        callback?.()
    }, [])

    Taro.useLoad(() => {
        getData()
    })

    Taro.useDidShow(() => {
        void (async () => {
            const { title = '等额本息' } = (await getStorageData('USER_LOAN_WAY')) || {}
            setState({ userLoanWay: title })
        })()
    })

    /**
     * 获取渲染项，处理picker range以及默认值
     * 需要在每次表单值改变后重新调用
     */
    function updateRenderList() {
        const { params, options, loanLrpType, commerceLoanRateNew, way } = stateRef.current
        const commerceLoanRateEqua = `${params.loanLrp * 100}% + ${params.commercialLoanBasePoint}‱ = `

        const commerceLoanRateNewUnit = `${formatFloat(commerceLoanRateNew * 100, 2)}%`
        setState({
            renderList: createRenderList({
                ...params,
                options,
                way,
                downPayRateCustom: params.downPayRate,
                loanLrpType,
                commerceLoanRateEqua,
                commerceLoanRateNewUnit
            })
        })
    }

    /**
     * @description 请求配置
     */
    function getData() {
        const { params } = stateRef.current
        const { default: defaultData, options } = OPTION
        // 处理首付比例 手动输入选项 以及公积金利率一年 五年 商贷利率
        const {
            downPayRate = [],
            commerceLoanRate = [],
            commerceLoanInFiveYearRate = [],
            commerceLoanInOneYearRate = [],
            accumulatFundRate = [],
            accumulatFundInFiveYearRate = []
        } = options
        downPayRate.splice(0, 0, {
            value: -1,
            label: '手动输入'
        })
        handleDownPaySelectLabel(params.houseTotal, downPayRate)
        params.loanAmount = Math.ceil(handleAmount(params.houseTotal, defaultData.downPayRate) as number)
        // 处理旧版商贷利率 关联 商贷年限
        commerceLoanRate.forEach((rate: any) => {
            // 大于五年
            rate.limit = 'outFive'
        })
        params.commerceOutFiveLoanRate = defaultData.commerceLoanRate
        commerceLoanInFiveYearRate.forEach((rate: any) => {
            // 2-5年期
            rate.limit = 'inFive'
        })
        commerceLoanInOneYearRate.forEach((rate: any) => {
            // <1年期
            rate.limit = 'inOne'
        })
        options.commerceLoanRate = [...commerceLoanRate, ...commerceLoanInFiveYearRate, ...commerceLoanInOneYearRate]
        // 处理公积金利率 关联 公积金年限
        accumulatFundRate.forEach((rate: any) => {
            // >5年期
            rate.limit = 'outFive'
        })
        params.accumulatOutFiveFundRate = defaultData.accumulatFundRate
        accumulatFundInFiveYearRate.forEach((rate: any) => {
            // <=5年期
            rate.limit = 'inFive'
        })
        options.accumulatFundRate = [...accumulatFundRate, ...accumulatFundInFiveYearRate]
        const commerceLoanRateNew = formatFloat(defaultData.loanLrp + params.commercialLoanBasePoint / 10000, 4)
        setState(
            {
                ...OPTION,
                commerceLoanRateNew,
                params: { ...params, ...defaultData }
            },
            () => {
                updateRenderList()
                params.houseTotal && void submit()
            }
        )
    }

    /**
     * picker 选择回调
     * @param data 当前选择配置项数据
     * @param selectObj 已选的数据项
     */
    function onChangePicker(data: any, selectObj: { value: number | string; label: string }) {
        const { key } = data
        const { params } = stateRef.current
        const selectValue = Number(selectObj.value)
        // 处理首付比例切换
        if (key === 'downPayRate') {
            const isInput = selectValue === -1
            params[key] = isInput ? params[key] : selectValue
            if (!isInput) {
                params.loanAmount = Math.ceil(handleAmount(params.houseTotal, selectValue) as number)
                params.commerceTotalPirce = Math.max(parseInt(params.loanAmount) - params.accumulatTotalPirce, 0)
                params.accumulatTotalPirce = parseInt(params.loanAmount) - params.commerceTotalPirce
            }
            setState(
                {
                    params,
                    btnOpacity: isInput ? 0 : 1,
                    // -1 标识手动输入
                    keyboardHeight: isInput ? 0 : -1
                },
                updateRenderList
            )
            return
        }

        // 切换公积金年限 修改默认值
        if (data.key === 'accumulatFundYear') {
            params.accumulatFundRate =
                selectValue > 5 ? params.accumulatOutFiveFundRate : params.accumulatFundInFiveYearRate
        }
        // 切换商贷年限 修改默认值
        if (data.key === 'commerceLoanYear') {
            params.commerceLoanRate =
                selectValue > 5
                    ? params.commerceOutFiveLoanRate
                    : selectValue > 1
                      ? params.commerceLoanInFiveYearRate
                      : params.commerceLoanInOneYearRate
        }
        params[key] = selectObj.value
        let loanLrpTypeObj: Record<string, any> = {}
        if (data.key === 'loanLrp') {
            loanLrpTypeObj = {
                loanLrpType: selectObj.label.indexOf('最新') > -1 ? 1 : 0
            }
        }

        setState(
            {
                params,
                ...loanLrpTypeObj
            },
            updateRenderList
        )
    }

    /**
     * 处理首付展示
     */
    function handleDownPaySelectLabel(data: number | string, range?: any[]) {
        const { options } = stateRef.current
        const list = range || options.downPayRate
        list.forEach((pay: any) => {
            pay.labelCopy = pay.labelCopy || pay.label
            const amount = Math.floor(formatFloat(pay.value * parseInt(data as string, 10), 1) as number)
            if (pay.value !== -1 && amount >= 0) {
                pay.label = `${pay.labelCopy} (${amount}万)`
            } else {
                pay.label = pay.labelCopy
            }
        })
        setState({
            options
        })
    }

    /**
     * input 值改变回调
     * @param data 配置项
     * @param value 输入的值
     * @param _index 当前配置项的索引
     */
    function onInputChange(data: any, _value: number, _index: number) {
        const { params } = stateRef.current
        const value = _value > 0 ? _value : 0

        // 处理房屋总价输入时自动计算贷款金额
        if (data.key === 'houseTotal') {
            handleDownPaySelectLabel(value)
            const { downPayRate } = params
            params.loanAmount = Math.ceil(handleAmount(value, downPayRate) as number)
        }

        params[data.key] = value

        // 修改贷款金额或房屋总价（两种计算方式）更新商贷金额
        if (data.key === 'loanAmount' || data.key === 'houseTotal') {
            params.commerceTotalPirce = parseInt(params.loanAmount) - params.accumulatTotalPirce
            params.commerceTotalPirce = params.commerceTotalPirce > 0 ? params.commerceTotalPirce : 0
        }
        const baseParams: any = {}
        // 处理新版商贷利率 基点修改
        if (data.key === 'commercialLoanBasePoint') {
            baseParams.commerceLoanRateNew = formatFloat(params.loanLrp + params.commercialLoanBasePoint / 10000, 4)
        }
        // fix: wx 中 当超出限制时，onInput取的值始终是上限值，但页面依然能够输入
        // 修改公积金金额时 更新商贷金额
        if (data.key === 'accumulatTotalPirce') {
            params.accumulatTotalPirceMaxValue = -1
            params.commerceTotalPirce = parseInt(params.loanAmount) - params.accumulatTotalPirce
            if (params.commerceTotalPirce <= 0) {
                params.commerceTotalPirce = 0
                params.accumulatTotalPirce = parseInt(params.loanAmount) - params.commerceTotalPirce
                params.accumulatTotalPirceMaxValue = params.accumulatTotalPirce
            }
        }
        const { accumulatLoanLimit } = params
        // 修改商贷金额时 更新公积金金额
        if (data.key === 'commerceTotalPirce') {
            params.commerceTotalPirce =
                params.commerceTotalPirce > params.loanAmount ? params.loanAmount : params.commerceTotalPirce
            params.accumulatTotalPirce = parseInt(params.loanAmount) - params.commerceTotalPirce
        }
        // 校验公积金金额是否大于上限
        if (params.accumulatTotalPirce > accumulatLoanLimit) {
            // 修改商贷时 只提示一次
            if (isFirstChangeRef.current || data.key !== 'commerceTotalPirce') {
                Taro.showToast({
                    title: `当前城市公积金最高可贷${accumulatLoanLimit}万`,
                    icon: 'none'
                })
                params.commerceTotalPirce = parseInt(params.loanAmount) - accumulatLoanLimit
            }
            isFirstChangeRef.current = !(data.key === 'commerceTotalPirce')
            params.accumulatTotalPirce = accumulatLoanLimit
            params.accumulatTotalPirceMaxValue = accumulatLoanLimit
        }
        setState(
            {
                params,
                ...baseParams
            },
            updateRenderList
        )
    }

    /**
     * 处理切换计算方式时，贷款总额或房屋总价
     */
    function handleAmount(value: string | number, ratio: number) {
        return formatFloat(parseInt(value + '', 10) * (1 - ratio), 1)
    }

    /**
     * 计算方式、贷款方式改变事件
     * @param data
     */
    function onWayClick(data: any) {
        const { key, index } = data
        let obj: Record<string, any> = {}
        // 处理切换成按房屋总价时 房屋总价根据 贷款总额 * (1 + 首付比例)
        if (data.key === 'way' && index === 1) {
            const { params } = stateRef.current
            const { downPayRate, loanAmount } = params
            params.houseTotal = Math.floor(formatFloat(loanAmount / (1 - downPayRate), 1) as number)
            obj = { params }
            handleDownPaySelectLabel(params.houseTotal)
        }
        if (data.key === 'way' && index === 0) {
            const { params } = stateRef.current
            const { loanAmount } = params
            params.loanAmount = Math.ceil(formatFloat(loanAmount, 1) as number)
            obj = { params }
        }
        setState(
            {
                [key]: index,
                showResult: false,
                ...obj
            },
            updateRenderList
        )
    }

    /**
     * 页面跳转
     * @param path 跳转路径
     */
    function goPage(path: string, data: object = {}) {
        return () => {
            setGlobalData('COMPUTE_RESULT', data)
            Taro.navigateTo({
                url: `/pages/calculator/${path}/index`
            })
        }
    }

    /**
     * 首付选择手动输入处理
     * @param e
     */
    function downPayRateHandle(e: any) {
        const { value } = e.detail
        const valueNumbe = parseInt(value, 10)
        // 输入范围0-99
        setState({
            downPayRateCustom: valueNumbe
        })
    }

    /**
     * 确定手动输入首付比例
     */
    function downPayRateConfirm() {
        const { options, params, downPayRateCustom } = stateRef.current
        const { downPayRate } = options
        const value = parseInt(downPayRateCustom, 10)
        if (!(value > 0 && value <= 99)) {
            setState({
                btnOpacity: 1,
                keyboardHeight: -1
            })
            return
        }
        const realValue = value / 100
        const existIndex = downPayRate.findIndex((item: any) => item.value === realValue)
        if (realValue && existIndex < 0) {
            const maxIndex = downPayRate.length - 1
            const insertIndex = downPayRate.findIndex(
                (item: any, index: number) =>
                    realValue > item.value && realValue < (index < maxIndex ? downPayRate[index + 1].value : Infinity)
            )
            downPayRate.splice(insertIndex + 1, 0, {
                value: realValue,
                label: `${downPayRateCustom}%`
            })
        }
        params.downPayRate = realValue
        params.loanAmount = Math.ceil(handleAmount(params.houseTotal, params.downPayRate) as number)
        params.commerceTotalPirce = parseInt(params.loanAmount) - params.accumulatTotalPirce
        setState(
            {
                options,
                params,
                btnOpacity: 1,
                keyboardHeight: -1
            },
            () => {
                handleDownPaySelectLabel(params.houseTotal)
                updateRenderList()
            }
        )
    }

    /**
     * 检验公积金金额
     */
    function checkAccumulatLoanAmount() {
        const { params } = stateRef.current
        const { accumulatLoanLimit, accumulatTotalPirce } = params
        if (accumulatTotalPirce > accumulatLoanLimit) {
            Taro.showToast({
                title: `当前城市公积金最高可贷${accumulatLoanLimit}万`,
                icon: 'none'
            })
            params.accumulatTotalPirce = accumulatLoanLimit
            return
        }
        const amount = parseInt(params.loanAmount) - params.commerceTotalPirce
        params.accumulatTotalPirce = amount
        if (amount > accumulatLoanLimit) {
            Taro.showToast({
                title: `当前城市公积金最高可贷${accumulatLoanLimit}万`,
                icon: 'none'
            })
            params.accumulatTotalPirce = accumulatLoanLimit
            params.commerceTotalPirce = parseInt(params.loanAmount) - params.accumulatTotalPirce
        }
    }

    function checkParams() {
        const { params, loanType } = stateRef.current
        const { loanAmount, accumulatTotalPirce, commerceTotalPirce, accumulatLoanLimit } = params
        if (loanAmount === 0) {
            Taro.showToast({
                title: `贷款金额不能为0`,
                icon: 'none'
            })
            return false
        }
        if (loanType === 0 && loanAmount !== commerceTotalPirce + accumulatTotalPirce) {
            Taro.showToast({
                title: `商贷金额和公积金贷款金额之和必须等于贷款总额`,
                icon: 'none'
            })
            return false
        }
        if (loanType === 2 && loanAmount > accumulatLoanLimit) {
            Taro.showToast({
                title: `当前城市公积金最高可贷${accumulatLoanLimit}万`,
                icon: 'none'
            })
            return false
        }
        return true
    }

    function getTip(showMonthlyPay = true) {
        const { params, loanType, loanLrpType, commerceLoanRateNew, userLoanWay } = stateRef.current
        const {
            commerceLoanYear,
            accumulatFundYear,
            accumulatFundRate,
            accumulatTotalPirce,
            commerceTotalPirce,
            commerceLoanRate,
            loanAmount,
            downPayRate
        } = params
        const downPayRateStr = `首付${formatFloat(downPayRate * 100, 2)}%`
        const accumulatStr = `公积金贷${
            loanType === 2 ? loanAmount : accumulatTotalPirce
        }万·${accumulatFundYear}年·利率${formatFloat(accumulatFundRate * 100, 2)}%`
        const commerceLoanRateStr = `${formatFloat(
            (loanLrpType === 1 ? commerceLoanRateNew : commerceLoanRate) * 100,
            2
        )}`
        const commerceStr = `商业贷${
            loanType === 1 ? loanAmount : commerceTotalPirce
        }万·${commerceLoanYear || 0}年·利率${commerceLoanRateStr}%`
        const loanStr = loanType === 0 ? [accumulatStr, commerceStr] : loanType === 1 ? [commerceStr] : [accumulatStr]
        const loanWayStr = `${userLoanWay || '等额本息'}`
        const tip = (showMonthlyPay ? [downPayRateStr, ...loanStr, loanWayStr] : [downPayRateStr, ...loanStr]).join(
            '、'
        )
        return tip
    }

    async function submit() {
        if (loadingRef.current) return
        if (!checkParams()) return
        Taro.showLoading({
            title: '计算中...'
        })

        const { params, loanType, loanLrpType, commerceLoanRateNew, userLoanWay } = stateRef.current
        const {
            commerceLoanYear,
            accumulatFundYear,
            accumulatFundRate,
            accumulatTotalPirce,
            loanAmount,
            commerceTotalPirce,
            commerceLoanRate,
            houseTotal
        } = params
        const res: any = await equalInterestCalc({
            totalPrice: houseTotal,
            commerceLoanYear,
            commerceLoanRate: loanLrpType === 1 ? commerceLoanRateNew : commerceLoanRate,
            accumulatFundYear,
            accumulatFundRate,
            accumulatTotalPirce: loanType === 2 ? loanAmount : accumulatTotalPirce,
            commerceTotalPirce: loanType === 1 ? loanAmount : commerceTotalPirce
        })
        try {
            const tip = getTip(false)
            computeResultRef.current = {
                ...res,
                loanAmount,
                tip
            }
            const backgroundColor = '#12B983'
            setState({
                tip,
                showResult: true,
                equalInterestPayMonth: res.equalInterest.payMonth,
                equalPrincipalPayMonth: res.equalPrincipal.payMonth,
                backgroundColor
            })
            Taro.setNavigationBarColor({
                frontColor: '#ffffff',
                backgroundColor
            })
            Taro.pageScrollTo({
                scrollTop: 0,
                duration: 300
            })
            const list: any = (await getStorageData('LOAN_HISTORY')) || []
            const historyList = [
                {
                    commerceLoanYear: commerceLoanYear,
                    commerceTotalPirce: loanType === 1 ? loanAmount : loanType === 2 ? 0 : commerceTotalPirce,
                    accumulatFundYear,
                    accumulatTotalPirce: loanType === 1 ? 0 : loanType === 2 ? loanAmount : accumulatTotalPirce,
                    payMonthStr: userLoanWay === '等额本息' ? '每月应还(等额本息)' : '首月应还(等额本金)',
                    firstPay: userLoanWay === '等额本息' ? res.equalInterest.payMonth : res.equalPrincipal.payMonth
                },
                ...list
            ]
            await Taro.setStorage({
                key: 'LOAN_HISTORY',
                data: historyList.slice(0, 10)
            })
        } catch (e) {
            console.log(e)
        } finally {
            setTimeout(() => {
                Taro.hideLoading()
            }, 1000)
            loadingRef.current = false
        }
    }

    const {
        way,
        loanType,
        renderList,
        params,
        keyboardHeight,
        btnOpacity,
        userLoanWay,
        equalInterestPayMonth,
        equalPrincipalPayMonth,
        showResult,
        backgroundColor
    } = state
    const { houseTotal, downPayRate } = params
    const navigationBarColor = backgroundColor === '#fff' ? '#0B0F12' : '#fff'

    return (
        <View className="relative flex flex-col flex-1 bg-white h-screen w-full overflow-hidden">
            <NavigationBar backgroundColor={backgroundColor} color={navigationBarColor}>
                <Text>房贷计算器</Text>
            </NavigationBar>
            {keyboardHeight >= 0 && (
                <View className="fixed bottom-0 left-0 right-0 top-0 z-9999 size-full">
                    <View className="fixed bottom-0 left-0 right-0 top-0 z-90 size-full bg-[rgba(0,0,0,0.6)]" />

                    <View
                        className="fixed bottom-0 left-0 right-0 z-99 box-border flex h-12.5 flex-row items-center bg-white"
                        style={{
                            bottom: isAndroid() ? 0 : keyboardHeight
                        }}
                    >
                        <Text className="ml-5 flex h-6.75 shrink-0 items-center font-pingfang-regular text-base font-normal leading-6.75 text-[rgba(171,175,177,1)]">
                            请输入
                        </Text>
                        <ScrollView
                            scrollY
                            // keyboardShouldPersistTaps="always"
                            // enableAutomaticScroll={false}
                            className="ml-6.75 flex-1 overflow-hidden rounded-xs bg-[rgba(240,240,240,1)] px-1.25"
                        >
                            <Input
                                keyboardType="number-pad"
                                type="number"
                                // 针对小程序中底部fixed input被遮盖一部分 设置光标距离键盘距离
                                cursorSpacing={10}
                                className="h-6.75"
                                focus
                                style={{
                                    // @ts-expect-error 针对安卓文字显示不全
                                    paddingVertical: 0
                                }}
                                onInput={downPayRateHandle}
                                onBlur={downPayRateConfirm}
                                holdKeyboard
                            />
                        </ScrollView>

                        <Text
                            className="mx-4 shrink-0 font-pingfang-regular text-base font-normal text-[rgba(31,176,129,1)]"
                            onClick={downPayRateConfirm}
                        >
                            确定
                        </Text>
                    </View>
                </View>
            )}

            <ScrollView
                scrollY
                ref={(ref) => {
                    scrollRef.current = ref
                }}
                className={'flex-1 overflow-x-hidden overflow-y-scroll flex flex-col'}
                enable-flex="true"
            >
                {showResult && (
                    <LoanGeniusHeader
                        way={way}
                        tip={getTip()}
                        downPayRate={downPayRate}
                        equalInterestPayMonth={equalInterestPayMonth}
                        equalPrincipalPayMonth={equalPrincipalPayMonth}
                        houseTotal={houseTotal}
                        userLoanWay={userLoanWay}
                        goHistory={goPage('history')}
                        goMonthlyPayments={goPage('monthly-payments', computeResultRef.current)}
                    />
                )}

                <View className="px-5 pb-8">
                    <TitleTpl title="计算方式" data={COMPUTE_WAY_TITLE} onWayClick={onWayClick} activeIndex={way} />
                    <LineWrap
                        data={renderList}
                        type={COMPUTE_WAY[way]}
                        onChangePicker={onChangePicker}
                        onInputChange={onInputChange}
                    />
                    <TitleTpl title="贷款方式" data={LOAN_WAY_TITLE} onWayClick={onWayClick} activeIndex={loanType} />

                    <LineWrap
                        data={renderList}
                        type={LIST_TYPE[loanType]}
                        onBlur={checkAccumulatLoanAmount}
                        onChangePicker={onChangePicker}
                        onInputChange={onInputChange}
                    />
                </View>
            </ScrollView>

            <BoxShadow
                shadowColor="#000"
                shadowOffset={{
                    width: 0,
                    height: -1
                }}
                shadowOpacity={0.1}
                shadowRadius={1}
                elevation={5}
                className="flex w-full items-center justify-center bg-white"
                style={{
                    opacity: btnOpacity
                }}
                boxShadow="0px 2px 8px 0px rgba(211,215,218,1)"
            >
                <Button
                    className="flex p-2 m-4 flex-1 items-center justify-center leading-normal rounded-xs bg-[rgba(35,201,147,1)] text-center"
                    onClick={submit}
                >
                    <Text className="font-pingfang-regular text-lg font-normal text-white">开始计算</Text>
                </Button>
            </BoxShadow>
        </View>
    )
}
