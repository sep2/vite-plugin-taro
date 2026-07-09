# 小程序地图相关 skill 索引

当用户意图涉及「小程序地图组件 / 定位」或「腾讯位置服务 Web API」时，本 skill 不直接处理，请路由到下方对应的**外部 skill**。

## 一、小程序地图组件 / 定位

**对应外部 skill**：<https://skillhub.cn/skills/tencentmap-miniprogram-skill>

**触发关键词（示例，非穷举）**：

- **组件与覆盖物**：`map` 组件、`marker`、`polyline`、`polygon`、`circle`、点聚合、热力图、`callout` / `customCallout`、`label`、`include-points`、`MapContext`、自定义 marker、轨迹线、地理围栏 / 电子围栏、暗色 / 卫星 / 3D 地图、地图样式、地图事件（点击 / 拖动 / 移动）、散点图、轨迹回放
- **定位与位置**：`wx.getLocation`、`wx.chooseLocation`、`wx.openLocation`、`wx.choosePoi`、持续定位、`getRegion` / `getCenterLocation` / `moveToLocation`、`scope.userLocation`、经纬度、GPS / LBS、定位权限、定位不准 / 偏移、"回到当前位置"、"让用户选个地方"、签到打卡定位、外勤 / 考勤定位、配送员实时位置、跑步轨迹
- **口语场景**：想放个地图、展示门店位置、显示配送范围、画配送区域、地图上标点、显示我的位置、选择地址 / 收货地址、门店分布图

## 二、腾讯位置服务 Web 服务（后端能力）

**对应外部 skill**：<https://skillhub.cn/skills/tencentmap-webservice-skill>

**触发关键词（示例，非穷举）**：

- **路线规划**：驾车 / 步行 / 骑行 / 公交路线、途经点 `waypoints`、多方案、最短路径、"从 A 到 B 怎么走"、"导航去那里"
- **搜索与联想**：POI 搜索、周边 / 附近搜索、关键词 / 模糊搜索、`suggest` 输入提示、地点联想、"附近的餐厅"、"搜一下附近"
- **地理编码 / 坐标**：地址 ↔ 坐标互转、逆地理编码、坐标系转换（`gcj02` / `wgs84` / `bd09`）、行政区划 `adcode`、省市区、"经纬度转地址"
- **距离与区域**：直线 / 驾车距离、批量距离矩阵、"最近的门店"、"按距离排序"、"是否在配送范围内"、电子围栏判断、服务区域判定
- **其他能力**：IP 定位、"用户在哪个城市"、天气查询
- **综合口语**：一键导航、跳转导航、导航到店、物流轨迹、历史轨迹回放、实时追踪

## 使用规则

1. 匹配到上述任一关键词或场景 → **直接指向对应的外部 skill 链接**；不要试图用本 skill 包里的 `wechatide` 工具去回答地图组件用法或位置服务 API。
2. 只涉及「打开 / 编译 / 预览一个包含地图的页面」这类**微信开发者工具动作本身**（编译、预览、模拟器刷新等），仍走本 skill 已有 scene（`compiler` / `previewer` 等）。
3. 两个外部 skill 的分界：
   - **在小程序前端里用**（组件、JSAPI、`wx.getLocation` 等）→ `tencentmap-miniprogram-skill`
   - **调后端 HTTP 接口**（路线规划、POI 搜索、地理编码、距离矩阵等）→ `tencentmap-webservice-skill`
   - 同时涉及两侧时，先按用户当前主目标路由，再提示另一侧存在。
