(function () {
  "use strict";
  const lengthText = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', {useGrouping:false, minimumFractionDigits:2, maximumFractionDigits:2});

  const entryRoot = document.getElementById("entryRoot");
  const productShell = document.getElementById("productShell");
  const workspace = document.getElementById("workspace");
  const overlayRoot = document.getElementById("overlayRoot");
  const toastRoot = document.getElementById("toastRoot");
  const messageCenterRoot = document.getElementById("messageCenterRoot");
  const messageCenterButton = document.getElementById("messageCenterButton");
  const messageUnreadCount = document.getElementById("messageUnreadCount");
  const navGroups = [
    { id: "maps", title: "一张图", icon: "p02", items: [{ page: "p02", label: "运维一张图" }, { page: "p02dma", label: "DMA 分区计量一张图" }, { page: "p02asset", label: "管网资产一张图" }, { page: "p10", label: "SCADA 监测一张图" }, { page: "simulation", label: "实时仿真一张图", v2:true }, {page:"qualityMap",label:"水质管控一张图",v2:true}] },
    { id: "topology", title: "拓扑管理", icon: "p03", items: [{ page: "p03", label: "拓扑版本管理" }, { page: "p04", label: "拓扑编辑器" }, { page: "p12", label: "拓扑设备管理" }] },
    { id: "dma", title: "DMA 分区管理", icon: "p07", items: [{ page: "p06", label: "DMA 方案管理" }, { page: "p07", label: "DMA 分区编辑器" }, { page: "p06h", label: "DMA 历史记录" }] },
    { id: "analysis", title: "分析模块", icon: "p11", items: [{ page: "p11", label: "监测点趋势" }, {page:"leakage",label:"DMA 漏损分析"}, { page: "p08", label: "对比分析" }, { page: "p09", label: "对比数据总览" }, {page:"calculationCenter",label:"计算中心",v2:true}, {page:"resultCompare",label:"结果与方案对比",v2:true}] },
    { id: "data", title: "数据模块", icon: "p12", items: [{ page: "devices", label: "设备管理" }, {page:"reports",label:"报表中心"}, { page: "p14", label: "数据质量" }, { page: "p10h", label: "监测历史记录" }] },
    { id: "alarms", title: "异常报警", icon: "p13", items: [{ page: "p13", label: "当日报警" }, { page: "p13h", label: "报警历史记录" }] },
    { id: "work", title: "工单与巡检", icon: "work", items: [{ page: "p15", label: "工单管理" }, { page: "p16", label: "巡检管理" }, { page: "p15h", label: "工单巡检历史" }, {page:"controlPlans",label:"管控计划",v2:true}] },
    { id: "hydraulic", title: "水力模型", icon: "model", version: "2.0", items: [{page:"hydraulic",label:"水力沙箱"},{page:"hydraulicHistory",label:"历史计算结果"},{page:"modelReview",label:"标准场景"},{page:"valveAnalysis",label:"管网操作分析"},{page:"emergency",label:"应急预案"}] },
    {id:"quality",title:"水质模型",icon:"qualityModel",version:"2.0",items:[{page:"qualityScenes",label:"水质沙箱"},{page:"qualityHistory",label:"历史计算结果"},{page:"qualityEvent",label:"异常影响分析"}]},
    { id: "ai", title: "AI 智能体", icon: "ai", version: "2.0", items: [{ label: "运行研判", icon:"aiAnalysis", future: true }, { label: "调度助手", icon:"aiDispatch", future: true }, { label: "运维助手", icon:"aiMaintenance", future: true }] }
  ];
  const regionOptions = {
    "湖北省": { "随州市": ["曾都区", "随县", "广水市"] },
    "浙江省": { "杭州市": ["上城区", "拱墅区", "西湖区"], "宁波市": ["海曙区", "鄞州区", "江北区"] },
    "山东省": { "青岛市": ["市南区", "市北区", "崂山区"], "济南市": ["历下区", "市中区", "槐荫区"] },
    "广东省": { "佛山市": ["禅城区", "南海区", "顺德区"], "广州市": ["越秀区", "海珠区", "天河区"] },
    "江苏省": { "南京市": ["玄武区", "浦口区", "江宁区"], "苏州市": ["姑苏区", "吴中区", "相城区"] }
  };

  function createMapLayerStyle() {
    const point = (min, low, middle, high) => ({ min, max: 18, low, middle, high });
    return {
      lines: {
        main: { min: 4, max: 18, width: 3, color: "#1677ff" },
        branch: { min: 7, max: 18, width: 2, color: "#69b1ff" }
      },
      points: {
        pressure: point(6, 10, 15, 19), flow: point(6, 10, 15, 19), quality: point(8, 9, 14, 18), level: point(8, 9, 14, 18),
        nodes: point(9, 6, 8, 11), valves: point(7, 8, 11, 15), alarms: point(8, 10, 16, 20), workorders: point(8, 10, 16, 20),
        plants: point(3, 12, 16, 20), pumps: point(5, 10, 15, 19), users: point(5, 10, 15, 19)
      },
      labels: { min: 8, max: 18, fontSize: 12, color: "#262626" }
    };
  }

  const pipeClassificationFields = {
    diameter: { label: "管径", unit: "DN" },
    material: { label: "管材", unit: "" },
    age: { label: "管龄", unit: "年" }
  };

  function createPipeClassification(field = "diameter") {
    const colors = ["#ff4d4f", "#fa8c16", "#1677ff", "#722ed1"];
    if (field === "material") return { field, values: ["球墨铸铁", "钢管", "PE", "PVC"], breaks: [], colors };
    return { field, values: [], breaks: field === "age" ? [5, 15, 30] : [150, 300, 600], colors };
  }

  function createDmaZoneColors() {
    return { "DMA-A": "#52c41a", "DMA-B": "#1677ff", "DMA-C": "#fa8c16", "DMA-A-1": "#13c2c2", "DMA-A-2": "#73d13d", "DMA-B-1": "#722ed1", "DMA-B-2": "#4096ff", "DMA-C-1": "#ff4d4f", "DMA-C-2": "#faad14", "DMA-A-1-1": "#08979c", "DMA-A-1-2": "#36cfc9" };
  }

  const state = {
    authenticated: false,
    topologyProjects: {},
    selectedTopology: "T3",
    topologyQuery: "",
    topologyStatus: "",
    bindingObject: "PLANT-001",
    bindingMetric: "flow",
    bindingDraft: null,
    bindingMessage: "",
    page: "login",
    activeProjectId: null,
    projectQuery: "",
    editingProjectId: null,
    projects: [
      ...(window.CampusDataset?[{id:window.CampusDataset.projectId,...window.CampusDataset.project}]:[]),
      { id: "PRJ-SUIZHOU", name: "随州市供水管网", province: "湖北省", city: "随州市", district: "曾都区 / 随县", status: "运行中", owner: "—", updated: "2026-09-21 09:17" },
      { id: "PRJ-001", name: "杭州市城区供水", province: "浙江省", city: "杭州市", district: "上城区", status: "运行中", owner: "张调度", updated: "2026-09-02 14:32" },
      { id: "PRJ-002", name: "青岛市供水管网", province: "山东省", city: "青岛市", district: "市南区", status: "运行中", owner: "李运维", updated: "2026-09-02 13:48" },
      { id: "PRJ-003", name: "佛山市城乡供水", province: "广东省", city: "佛山市", district: "南海区", status: "建设中", owner: "王工", updated: "2026-09-01 18:20" },
      { id: "PRJ-004", name: "南京市北部供水", province: "江苏省", city: "南京市", district: "浦口区", status: "已停用", owner: "陈管理员", updated: "2026-08-28 09:15" }
    ],
    timeMode: "REALTIME",
    navGroup: "maps",
    navDrawerOpen: false,
    p02Tab: "layers",
    p02Drawer: null,
    p02DrawerTab: "basic",
    p02LeftCollapsed: false,
    p02Tool: "select",
    p02LayersByView: {
      operations: { basemap: true, pipes: true, nodes: false, valves: false, pressure: true, flow: true, quality: true, level: true, dma: false, alarms: true, workorders: true, plants: true, pumps: true, users: true, hydrants:true, noise:true, labels: true },
      dma: { basemap: true, pipes: true, nodes: false, valves: true, pressure: true, flow: true, quality: true, level: false, dma: true, alarms: false, workorders: false, plants: true, pumps: true, users: true, hydrants:true, noise:true, labels: true },
      assets: { basemap: true, pipes: true, nodes: true, valves: true, pressure: false, flow: false, quality: false, level: false, dma: false, alarms: false, workorders: false, plants: true, pumps: true, users: true, hydrants:true, noise:true, labels: true }
    },
    mapLayerStyles: { operations: createMapLayerStyle(), dma: createMapLayerStyle(), assets: createMapLayerStyle(), scada: createMapLayerStyle() },
    pipeClassifications: { operations: createPipeClassification(), dma: createPipeClassification(), assets: createPipeClassification(), scada: createPipeClassification() },
    pipeClassHidden: { operations: [], dma: [], assets: [], scada: [] },
    layerStyleEditor: null,
    p02SearchQuery: "",
    p02SearchExecuted: false,
    p02BottomOpen: false,
    p02LayerOpen: true,
    p02BottomTabs: { operations: "pressure", dma: "zones", assets: "pipes" },
    p02BottomSort: "status",
    p02BottomPage: 1,
    p02BottomPageSize: 10,
    p02SelectedObjects: [],
    p02SelectionShape: null,
    p02ExpandedTree: ["dma-root", "dma-north", "dma-south", "dma-east", "dma-west", "custom-root", "asset-水厂", "asset-泵站", "asset-阀门", "asset-连接点", "asset-pipes"],
    p02SavedSelections: [],
    p02FocusedNode: null,
    p02FullExtent: false,
    p02Zoom: 100,
    p02DmaFocus: null,
    dmaZoneColors: createDmaZoneColors(),
    p02AlarmStatus: "待确认",
    p02WorkorderStatus: "待派单",
    p04Dirty: false,
    p04SplitDone: false,
    p04Toolbox: "edit",
    p05Running: false,
    p05Category: "connectivity",
    p05Issue: "connect-pipe-03",
    p05SelectedIslands: [],
    p05DeletedIslands: [],
    p07Step: 0,
    p07Selected: "l1-east",
    p08Run: true,
    p08Filter: "ALL",
    p08Selected: null,
    p08AllFields: false,
    compareMapType: "topology",
    compareDataType: "topology",
    p09Run: true,
    p09Selected: "DMA-A03",
    p09Boundary: false,
    p10Type: "all",
    p10Status: "all",
    p10Sort: "status",
    p10Selected: "P-032",
    p10Drawer: false,
    p10BottomOpen: false,
    p10LayerOpen: true,
    p10BottomTab: "pressure",
    p10Query: "",
    p10BottomPage: 1,
    p10BottomPageSize: 10,
    p10Layers: { basemap: true, pipes: true, nodes: false, valves: false, pressure: true, flow: true, quality: true, level: true, plants: true, pumps: true, users: true, hydrants:true, noise:true, labels: true },
    p10Zoom: 100,
    historyZoom: 100,
    historyBottomOpen: true,
    historyPageSize: 10,
    historyQuery: "",
    historyType: "",
    historyPage: 1,
    historySelection: { dma: "DMA-A", alarm: "ALM-20260907-016", work: "WO-2026-072", data: "P-032" },
    historyLayers: {
      dma: { basemap: true, pipes: true, dma: true, valves: true, plants: true, pumps: true, users: true },
      alarm: { basemap: true, pipes: true, pressure: true, alarms: true, workorders: false, plants: true, pumps: true, users: true },
      work: { basemap: true, pipes: true, alarms: false, workorders: true, plants: true, pumps: true, users: true },
      data: { basemap: true, pipes: true, pressure: true, flow: true, quality: true, level: true, plants: true, pumps: true, users: true }
    },
    mapDateRanges: {
      operations: { start: "2026-09-01", end: "2026-09-08", appliedStart: "2026-09-01", appliedEnd: "2026-09-08" },
      dma: { start: "2026-09-01", end: "2026-09-08", appliedStart: "2026-09-01", appliedEnd: "2026-09-08" },
      scada: { start: "2026-09-01", end: "2026-09-08", appliedStart: "2026-09-01", appliedEnd: "2026-09-08" },
      historyDma: { start: "2026-08-25", end: "2026-09-07", appliedStart: "2026-08-25", appliedEnd: "2026-09-07" },
      historyAlarm: { start: "2026-08-25", end: "2026-09-07", appliedStart: "2026-08-25", appliedEnd: "2026-09-07" },
      historyWork: { start: "2026-08-25", end: "2026-09-07", appliedStart: "2026-08-25", appliedEnd: "2026-09-07" },
      historyData: { start: "2026-08-25", end: "2026-09-07", appliedStart: "2026-08-25", appliedEnd: "2026-09-07" }
    },
    p11Range: "24h",
    p11Compare: "none",
    p12Mode: "list",
    p12Candidate: null,
    p12Bound: false,
    p13Selected: false,
    p13Status: "NEW",
    p14Filter: "all",
    messageCenterOpen: false,
    messageRead: [],
    tableColumnVisibility: {},
    tableColumnPanel: null,
    modal: null
  };

  const topologyCheckCategories = [
    { id: "connectivity", label: "连通性" },
    { id: "island", label: "孤岛" },
    { id: "diameter", label: "管径" },
    { id: "elevation", label: "坡度" }
  ];

  const topologyCheckIssues = [
    { id: "connect-pipe-03", category: "connectivity", subtype: "管线端点未连接节点", objectType: "Pipe", objectId: "PIPE-2026-003", title: "终点节点为空", position: "西北支干管", x: 42, y: 36, zoom: "1:500", mapPipes: [3], mapPoints: [], fields: [["pipe_id", "PIPE-2026-003"], ["start_node_id", "NODE-J01"], ["end_node_id", "空", true], ["几何起点", "302, 274"], ["几何终点", "368, 204"], ["最近节点", "VALVE-V101"], ["端点距离", "49.5 m"]] },
    { id: "connect-node-iso", category: "connectivity", subtype: "节点未连接管线", objectType: "Node", objectId: "NODE-ISO-01", title: "连接度为 0", position: "北部工业区", x: 69, y: 15, zoom: "1:500", mapPipes: [], mapPoints: ["NODE-ISO-01"], fields: [["node_id", "NODE-ISO-01"], ["node_type", "JUNCTION"], ["elevation", "31.20 m"], ["连接管线数", "0", true], ["上游管线", "空"], ["下游管线", "空"]] },
    { id: "island-01", category: "island", subtype: "非主连通分量", objectType: "Connected Component", objectId: "ISLAND-01", title: "3 管 3 点", position: "西北独立管段", x: 25, y: 17, zoom: "1:1000", metric: "Pipe 3 · Node 3 · 0.36 km", mapPipes: [18, 19, 20], mapPoints: ["NODE-I01", "NODE-I02", "NODE-I03"], fields: [["component_id", "ISLAND-01"], ["is_main", "否", true], ["pipe_ids", "PIPE-2026-018, 019, 020"], ["node_ids", "NODE-I01, I02, I03"], ["管线数量", "3"], ["节点数量", "3"], ["总管长", "0.36 km"]] },
    { id: "island-02", category: "island", subtype: "非主连通分量", objectType: "Connected Component", objectId: "ISLAND-02", title: "2 管 3 点", position: "西南临时管", x: 36, y: 89, zoom: "1:1000", metric: "Pipe 2 · Node 3 · 0.22 km", mapPipes: [21, 22], mapPoints: ["NODE-I04", "NODE-I05", "NODE-I06"], fields: [["component_id", "ISLAND-02"], ["is_main", "否", true], ["pipe_ids", "PIPE-2026-021, 022"], ["node_ids", "NODE-I04, I05, I06"], ["管线数量", "2"], ["节点数量", "3"], ["总管长", "0.22 km"]] },
    { id: "diameter-jump-v301", category: "diameter", subtype: "两通点管径突变", objectType: "Valve", objectId: "VALVE-V301", title: "两侧管径差 300 mm", position: "南部主干管", x: 45, y: 71, zoom: "1:500", mapPipes: [9, 10], mapPoints: ["VALVE-V301"], fields: [["valve_id", "VALVE-V301"], ["连接度", "2"], ["上游管线", "PIPE-2026-009"], ["上游管径", "DN200"], ["下游管线", "PIPE-2026-010"], ["下游管径", "DN500"], ["管径差", "300 mm", true], ["检查阈值", "> 100 mm"]] },
    { id: "diameter-pump-001", category: "diameter", subtype: "点线管径不一致", objectType: "Pump Station", objectId: "PUMP-001", title: "出口与管线管径不一致", position: "城西加压泵站", x: 20, y: 51, zoom: "1:500", mapPipes: [2], mapPoints: ["PUMP-001"], fields: [["pump_id", "PUMP-001"], ["出口管径", "DN600", true], ["连接管线", "PIPE-2026-002"], ["管线管径", "DN800", true], ["start_node_id", "PUMP-001"], ["end_node_id", "NODE-J01"]] },
    { id: "slope-pipe-013", category: "elevation", subtype: "管道坡度超过5%", objectType: "Pipe", objectId: "PIPE-2026-013", title: "计算坡度 8.3%", position: "南区供水支管", x: 68, y: 78, zoom: "1:500", mapPipes: [13], mapPoints: ["NODE-J04", "VALVE-V402"], fields: [["pipe_id", "PIPE-2026-013"], ["start_node_id", "NODE-J04"], ["end_node_id", "VALVE-V402"], ["起点高程", "48.60 m"], ["终点高程", "39.30 m"], ["管线长度", "112.0 m"], ["计算坡度", "8.3%", true], ["检查阈值", "> 5%"]] }
  ];

  const p02PipeCatalog = [
    ["PIPE-2026-001", "水厂出厂管", "DN800", "球墨铸铁"],
    ["PIPE-2026-002", "泵站出水主干管", "DN800", "球墨铸铁"],
    ["PIPE-2026-003", "城南主干管", "DN600", "球墨铸铁"],
    ["PIPE-2026-004", "北部主干管", "DN600", "钢管"],
    ["PIPE-2026-010", "南部主干管", "DN500", "球墨铸铁"],
    ["PIPE-2026-014", "南区用户接入管", "DN300", "PE"],
    ["PIPE-2026-017", "南部联络管", "DN400", "钢管"]
  ].map(item => ({ id: item[0], name: item[1], diameter: item[2], material: item[3] }));

  const p02MonitorCatalog = [
    { id: "Q-001", type: "flow", name: "水厂出厂流量", location: "泵站出水主干管", value: "1,286 m³/h", quality: "GOOD" },
    { id: "Q-018", type: "flow", name: "北部主干管流量", location: "北部主干管", value: "286 m³/h", quality: "DELAYED" },
    { id: "Q-032", type: "flow", name: "南部主干管流量", location: "南部主干管", value: "328 m³/h", quality: "GOOD" },
    { id: "P-018", type: "pressure", name: "北部连接点压力", location: "NODE J-02", value: "0.328 MPa", quality: "GOOD" },
    { id: "P-086", type: "pressure", name: "东南阀门压力", location: "VALVE V-401", value: "0.246 MPa", quality: "GOOD" },
    { id: "P-032", type: "pressure", name: "城南末梢压力点", location: "VALVE V-402", value: "0.182 MPa", quality: "GOOD", alarm: true },
    { id: "WQ-001", type: "quality", name: "第一水厂出厂水质", location: "第一水厂出厂口", value: "浊度 0.18 NTU", quality: "GOOD" },
    { id: "WQ-018", type: "quality", name: "东北用户末梢水质", location: "东北用户侧", value: "余氯 0.31 mg/L", quality: "GOOD" },
    { id: "WQ-032", type: "quality", name: "南区用户末梢水质", location: "南区用户侧", value: "余氯 0.16 mg/L", quality: "WARNING", alarm: true },
    { id: "WL-001", type: "level", name: "第一水厂清水池水位", location: "第一水厂", value: "4.82 m", quality: "GOOD" }
  ];

  const p02DmaCatalog = [
    { id: "DMA-A", parent: null, level: 1, name: "A 城西供水分区", path: "M40 214H250L380 274 250 334H40L22 300V244Z", labelX: 112, labelY: 310, inlet: "1,286.0 m³/h", outlet: "1,214.7 m³/h", inletTotal: "18.62 万m³", outletTotal: "17.59 万m³", pressure: "0.352 MPa", minPressure: "0.302 MPa", waterQuality: "余氯 0.32 mg/L", pressureLoss: "待水力模型计算", leakage: "5.5%", status: "正常" },
    { id: "DMA-B", parent: null, level: 1, name: "B 城北供水分区", path: "M250 214 390 128 680 52 826 68 850 92V274H380Z", labelX: 630, labelY: 136, inlet: "939.4 m³/h", outlet: "876.7 m³/h", inletTotal: "13.54 万m³", outletTotal: "12.63 万m³", pressure: "0.326 MPa", minPressure: "0.268 MPa", waterQuality: "浊度 0.21 NTU", pressureLoss: "0.041 MPa", leakage: "6.7%", status: "正常" },
    { id: "DMA-C", parent: null, level: 1, name: "C 城南供水分区", path: "M380 274H850V492L826 514 680 506 470 430 250 334Z", labelX: 650, labelY: 420, inlet: "895.2 m³/h", outlet: "829.6 m³/h", inletTotal: "12.89 万m³", outletTotal: "11.94 万m³", pressure: "0.241 MPa", minPressure: "0.182 MPa", waterQuality: "余氯 0.16 mg/L", pressureLoss: "待水力模型计算", leakage: "7.3%", status: "低压" },
    { id: "DMA-A-1", parent: "DMA-A", level: 2, name: "A-1 水厂供水区", path: "M40 214H250L380 274H22V244Z", labelX: 210, labelY: 214, inlet: "686.4 m³/h", outlet: "651.8 m³/h", inletTotal: "9.86 万m³", outletTotal: "9.36 万m³", pressure: "0.368 MPa", minPressure: "0.321 MPa", waterQuality: "浊度 0.18 NTU", pressureLoss: "0.018 MPa", leakage: "5.0%", status: "正常" },
    { id: "DMA-A-2", parent: "DMA-A", level: 2, name: "A-2 城西居民区", path: "M22 274H380L250 334H40L22 300Z", labelX: 120, labelY: 320, inlet: "599.6 m³/h", outlet: "562.9 m³/h", inletTotal: "8.76 万m³", outletTotal: "8.23 万m³", pressure: "0.336 MPa", minPressure: "0.302 MPa", waterQuality: "余氯 0.30 mg/L", pressureLoss: "待水力模型计算", leakage: "6.1%", status: "正常" },
    { id: "DMA-B-1", parent: "DMA-B", level: 2, name: "B-1 北部高区", path: "M250 214 390 128 680 52 826 68 850 92V170H320Z", labelX: 620, labelY: 112, inlet: "472.8 m³/h", outlet: "441.5 m³/h", inletTotal: "6.81 万m³", outletTotal: "6.36 万m³", pressure: "0.338 MPa", minPressure: "0.286 MPa", waterQuality: "余氯 0.28 mg/L", pressureLoss: "0.036 MPa", leakage: "6.6%", status: "正常" },
    { id: "DMA-B-2", parent: "DMA-B", level: 2, name: "B-2 东北供水区", path: "M320 170H850V274H380L250 214Z", labelX: 635, labelY: 230, inlet: "466.6 m³/h", outlet: "435.2 m³/h", inletTotal: "6.73 万m³", outletTotal: "6.27 万m³", pressure: "0.314 MPa", minPressure: "0.268 MPa", waterQuality: "浊度 0.22 NTU", pressureLoss: "待水力模型计算", leakage: "6.7%", status: "正常" },
    { id: "DMA-C-1", parent: "DMA-C", level: 2, name: "C-1 东南供水区", path: "M380 274H850V382H340L250 334Z", labelX: 650, labelY: 332, inlet: "456.8 m³/h", outlet: "425.7 m³/h", inletTotal: "6.58 万m³", outletTotal: "6.13 万m³", pressure: "0.268 MPa", minPressure: "0.238 MPa", waterQuality: "余氯 0.24 mg/L", pressureLoss: "0.052 MPa", leakage: "6.8%", status: "正常" },
    { id: "DMA-C-2", parent: "DMA-C", level: 2, name: "C-2 城南末梢区", path: "M340 382H850V492L826 514 680 506 470 430 250 334Z", labelX: 645, labelY: 470, inlet: "438.4 m³/h", outlet: "403.9 m³/h", inletTotal: "6.31 万m³", outletTotal: "5.81 万m³", pressure: "0.214 MPa", minPressure: "0.182 MPa", waterQuality: "余氯 0.16 mg/L", pressureLoss: "待水力模型计算", leakage: "7.9%", status: "低压" },
    { id: "DMA-A-1-1", parent: "DMA-A-1", level: 3, name: "A-1-1 水厂片区", path: "M40 214H178V274H22V244Z", labelX: 140, labelY: 204, inlet: "358.2 m³/h", outlet: "343.7 m³/h", inletTotal: "5.14 万m³", outletTotal: "4.93 万m³", pressure: "0.374 MPa", minPressure: "0.338 MPa", waterQuality: "浊度 0.18 NTU", pressureLoss: "0.009 MPa", leakage: "4.0%", status: "正常" },
    { id: "DMA-A-1-2", parent: "DMA-A-1", level: 3, name: "A-1-2 加压片区", path: "M178 214H250L380 274H178Z", labelX: 284, labelY: 218, inlet: "328.2 m³/h", outlet: "308.1 m³/h", inletTotal: "4.72 万m³", outletTotal: "4.43 万m³", pressure: "0.361 MPa", minPressure: "0.321 MPa", waterQuality: "余氯 0.31 mg/L", pressureLoss: "待水力模型计算", leakage: "6.1%", status: "正常" }
  ];

  const p02AssetCatalog = [
    { id: "PLANT-001", type: "水厂", name: "第一水厂", model: "15 万m³/d", location: "城西片区", status: "运行中" },
    { id: "PUMP-001", type: "泵站", name: "城西加压泵站", model: "4×560 kW", location: "第一水厂东侧", status: "运行中" },
    { id: "VALVE-V101", type: "阀门", name: "北干线调流阀", model: "DN600 蝶阀", location: "北部主干管", status: "正常" },
    { id: "VALVE-V201", type: "阀门", name: "北区用户控制阀", model: "DN300 闸阀", location: "北区用户支管", status: "正常" },
    { id: "VALVE-V202", type: "阀门", name: "东北用户控制阀", model: "DN300 闸阀", location: "东北用户支管", status: "正常" },
    { id: "VALVE-V301", type: "阀门", name: "南干线控制阀", model: "DN500 蝶阀", location: "南部主干管", status: "待巡检" },
    { id: "VALVE-V401", type: "阀门", name: "东南片区阀门", model: "DN300 闸阀", location: "东南用户支管", status: "正常" },
    { id: "VALVE-V402", type: "阀门", name: "南区用户控制阀", model: "DN300 闸阀", location: "南区用户支管", status: "正常" },
    { id: "NODE-J01", type: "连接点", name: "城西分流节点", model: "连接度 4", location: "城西主干管", status: "正常" },
    { id: "NODE-J02", type: "连接点", name: "北部联络节点", model: "连接度 4", location: "北部主干管", status: "正常" },
    { id: "NODE-J03", type: "连接点", name: "中部联络节点", model: "连接度 3", location: "中部联络管", status: "正常" },
    { id: "NODE-J04", type: "连接点", name: "南部联络节点", model: "连接度 4", location: "南部主干管", status: "正常" }
  ];

  const messageCenterItems = [
    { id: "MSG-001", type: "workorder", typeLabel: "工单", title: "WO-2026-083 等待派单", description: "南干线阀门巡检工单已创建，请安排运维班组。", time: "2 分钟前", target: "p02", value: "WO-2026-083" },
    { id: "MSG-002", type: "alarm", typeLabel: "告警", title: "城南末梢持续低压", description: "P-032 当前压力 0.182 MPa，已持续 28 分钟。", time: "6 分钟前", target: "p13", value: "ALM-032" },
    { id: "MSG-003", type: "model", typeLabel: "模型", title: "DMA 漏损计算已完成", description: "城南低压区漏损率更新为 7.1%，发现 2 个疑似漏损分区。", time: "18 分钟前", target: "p02dma", value: "DMA-城南-03" },
    { id: "MSG-004", type: "model", typeLabel: "模型", title: "拓扑检查任务已完成", description: "本次检查发现 7 个拓扑问题。", time: "35 分钟前", target: "p05", value: "connect-pipe-03" },
    { id: "MSG-005", type: "system", typeLabel: "系统", title: "流量数据出现延迟", description: "Q-018 最近一批数据延迟，请查看数据质量详情。", time: "1 小时前", target: "p14", value: "delayed" }
  ];

  const pageMeta = {
    hydraulicHistory:["水力历史计算结果",""], qualityHistory:["水质历史计算结果",""], modelReview:["标准场景",""], emergency:["应急预案",""], hydraulicModel:["水力模型管理",""], valveAnalysis:["关阀分析",""], burstAnalysis:["爆管分析",""], agingAnalysis:["老化分析",""], leakAnalysis:["泄漏分析",""], qualityModel:["水质模型管理",""], qualityScenes:["水质仿真与方案",""], qualityEvent:["异常影响分析",""], qualityMap:["水质管控一张图",""], calculationCenter:["计算中心",""], resultCompare:["结果与方案对比",""], controlPlans:["管控计划",""],
    hydraulic:["沙箱与方案", ""], hydraulicTrial:["调参试算", ""], hydraulicResults:["计算结果", ""], simulation:["实时仿真一张图", ""],
    p01: ["运维一张图", "数据总览模式，集中展示供水、监测、压力、水质、DMA 和待处置事项等关键运维指标。"],
    p02: ["运维一张图", "展示最新监测状态与当日报警、工单，支撑日常运行维护。"],
    p02dma: ["DMA 分区计量一张图", "查看分区用水量、平均压力和营收水量，按月对齐水量进行漏损分析。"],
    p02asset: ["管网资产一张图", "查看当前有效的管线、节点、阀门、水厂和泵站资产。"],
    p03: ["拓扑版本管理", ""],
    p04: ["拓扑编辑器", ""],
    p06: ["DMA 方案管理", ""],
    p06compare: ["DMA 方案对比", ""],
    p06h: ["DMA 历史记录", "按独立历史时间范围查看 DMA 边界、指标与变更快照。"],
    p07: ["DMA 分区管理", ""],
    p08: ["对比地图", "并排核对基准与当前管网，定位新增、删除及属性变化对象。"],
    p09: ["对比数据总览", "统一查看拓扑、DMA 分区和模型计算结果的指标与明细变化。"],
    p10: ["SCADA 监测一张图", "以 GIS 为空间入口查看各监测点的最新有效数据。"],
    p10h: ["监测历史记录", "按独立历史时间范围查看监测点快照与质量状态。"],
    p11: ["P-032 城南末梢压力点", "压力监测 · DMA-城南-03 · NODE-4388 · ASSET-N-077"],
    p12: ["拓扑设备管理", ""],
    devices: ["设备管理", ""], reports:["报表中心",""], leakage:["DMA 漏损分析",""],
    p13: ["当日报警", "查看今日报警上下文、空间位置、趋势并完成确认与处置。"],
    p13h: ["报警历史记录", "按独立历史时间范围追溯已归档报警与处置过程。"],
    p14: ["数据质量", "持续跟踪在线率、完整率、延迟、恒值、突变与挂接异常。"],
    p15: ["工单管理", "统一管理报警转单、计划工单、派单执行和闭环验收。"],
    p15h: ["工单巡检历史", "按独立历史时间范围追溯已完成工单、巡检与缺陷。"],
    p16: ["巡检管理", "面向管线与设施编制巡检计划、跟踪执行并沉淀缺陷记录。"]
  };

  function tag(text, type = "") {
    const dot = type === "success" ? "is-success" : type === "warning" ? "is-warning" : type === "error" ? "is-error" : type === "blue" ? "is-processing" : "";
    const cls = type ? ` app-tag-${type}` : "";
    return `<span class="app-tag${cls}">${dot ? `<span class="app-status-dot ${dot}"></span>` : ""}${text}</span>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function activeProject() {
    return state.projects.find(project => project.id === state.activeProjectId) || state.projects[0] || null;
  }

  function isCampusProject(){return state.activeProjectId===window.CampusProject?.projectId;}
  function renderCampusHydraulicPending(){return `<div class="product-page product-page-stack">${pageHeader(state.page)}<section class="app-card app-card-body"><h2 class="app-section-title">暂无计算数据</h2><p>${escapeHtml(window.CampusProject.pending)}</p><div class="app-toolbar"><button class="app-button app-button-primary" data-page="p02dma">查看 DMA 一张图</button><button class="app-button" data-page="p04">查看拓扑</button></div></section></div>`;}

  function navIcon(page) {
    const icons = {
      devices: '<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8M8 11h8"></path><circle cx="12" cy="16" r="2"></circle>',
      reports: '<path d="M4 3h11l5 5v13H4Z M15 3v5h5 M8 12h8 M8 16h8"></path>',
      leakage: '<path d="M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10Z M7 15l3-3 3 3 4-5"></path>',

      hydraulic: '<path d="m12 3 9 5-9 5-9-5Z"></path><path d="M3 8v9l9 5 9-5V8M12 13v9"></path>',
      hydraulicTrial: '<path d="M4 7h16M4 17h16"></path><circle cx="9" cy="7" r="3" fill="var(--color-bg-container)"></circle><circle cx="15" cy="17" r="3" fill="var(--color-bg-container)"></circle>',
      hydraulicResults: '<path d="M4 3h11l5 5v13H4Z M15 3v5h5 M8 17v-4 M12 17V9 M16 17v-6"></path>',
      simulation: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"></path><path d="m5 12 3-2 4 4 3-5 4 2"></path>',
      aiAnalysis: '<circle cx="10" cy="10" r="7"></circle><path d="m15 15 6 6 M5 11l3-3 3 4 3-5"></path>',
      aiDispatch: '<circle cx="5" cy="5" r="2"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="12" cy="19" r="2"></circle><path d="M7 5h10 M5 7v4h7v6 M19 7v4h-7"></path>',
      aiMaintenance: '<path d="M14 4a6 6 0 0 0-7 8L3 17a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-5-5Z"></path>',

      p01: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
      p02: '<path d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20Z"></path><path d="M9 4v13.5M15 6.5V20"></path>',
      p02dma: '<path d="M4 5 10 3l4 3 6-2v14l-6 3-4-3-6 2Z"></path><path d="M10 3v15M14 6v15"></path><path d="M6 12h3M15 13h3"></path>',
      p02asset: '<path d="M4 7h16v13H4Z"></path><path d="M8 7V4h8v3M4 12h16M9 12v3h6v-3"></path>',
      p03: '<path d="M4 7h6l2 2h8v10H4Z"></path><path d="M4 7V5h6l2 2h6"></path>',
      p04: '<path d="M4 20h4l11-11-4-4L4 16Z"></path><path d="m13.5 6.5 4 4M4 16l4 4"></path>',
      p05: '<path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6Z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path>',
      p06: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18M9 9v11M15 9v11"></path>',
      p07: '<circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="12" cy="18" r="2"></circle><path d="m7.7 7 3.2 8.8M16.3 7l-3.2 8.8M8 6h8"></path>',
      p08: '<path d="M4 8h14l-3-3M18 8l-3 3M20 16H6l3-3M6 16l3 3"></path>',
      p09: '<circle cx="6" cy="7" r="2"></circle><circle cx="18" cy="17" r="2"></circle><path d="M8 7h4a4 4 0 0 1 4 4v4M16 17h-4a4 4 0 0 1-4-4V9"></path>',
      p10: '<path d="M4 5h16v11H4Z"></path><path d="M8 20h8M12 16v4"></path><path d="m7 11 2-2 3 3 4-5 2 2"></path>',
      p11: '<path d="M4 19V5M4 19h16"></path><path d="m7 15 4-4 3 2 5-6"></path>',
      p12: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"></path>',
      p13: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"></path><path d="M10 20h4"></path>',
      p14: '<path d="M3 12h4l2-5 4 10 2-5h6"></path><circle cx="12" cy="12" r="9"></circle>',
      p15: '<path d="M7 4h10v3H7Z"></path><path d="M5 6h14v15H5Z"></path><path d="m8 12 2 2 5-5M8 18h7"></path>',
      p16: '<path d="M4 5h16v15H4Z"></path><path d="M8 3v4M16 3v4M4 10h16"></path><path d="m8 15 2 2 5-5"></path>',
      work: '<path d="M7 4h10v3H7Z"></path><path d="M5 6h14v15H5Z"></path><path d="m8 12 2 2 5-5M8 18h7"></path>',
      model: '<path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10Z"></path><path d="M8 16c2-2 6-2 8 0"></path>',
      ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path><circle cx="12" cy="12" r="5"></circle><path d="m8.5 8.5-2-2M17.5 17.5l-2-2M15.5 8.5l2-2M6.5 17.5l2-2"></path><circle cx="12" cy="12" r="1.5"></circle>'
    };
    const iconAliases = { hydraulicHistory:"hydraulicResults",qualityHistory:"hydraulicResults",modelReview:"hydraulicResults", emergency:"p13", hydraulicModel:"model",valveAnalysis:"p07",burstAnalysis:"p13",agingAnalysis:"aiMaintenance",leakAnalysis:"p14",qualityModel:"model",qualityScenes:"hydraulicTrial",qualityEvent:"aiAnalysis",qualityMap:"simulation",calculationCenter:"hydraulicResults",resultCompare:"p08",controlPlans:"work", p06compare:"p08", p06h: "p06", p10h: "p10", p13h: "p13", p15h: "work" };
    return `<svg class="product-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[page] || icons[iconAliases[page]] || icons.p01}</svg>`;
  }

  function pageHeader(page, actions = "") {
    const meta = pageMeta[page];
    const project = activeProject();
    const historyTargets = { p13: ["p13h", "查看历史记录"], p14: ["p10h", "查看监测历史"], p15: ["p15h", "查看历史记录"], p16: ["p15h", "查看历史记录"] };
    const historyAction = historyTargets[page] ? `<button class="app-button" type="button" data-page="${historyTargets[page][0]}">${historyTargets[page][1]}</button>` : "";
    return `<div class="app-breadcrumb"><span>${project ? escapeHtml(project.name) : "城市供水项目"}</span><span class="app-breadcrumb-separator">/</span><span class="app-breadcrumb-current">${meta[0]}</span></div>
      <section class="app-page-header">
        <div class="app-page-header-main"><h1 class="app-page-title">${meta[0]}</h1>${meta[1] ? `<p class="app-page-header-description">${meta[1]}</p>` : ""}</div>
        <div class="app-page-header-actions">${historyAction}${actions}</div>
      </section>`;
  }

  const p02TrendTimes = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "15:00", "18:00", "21:00", "24:00"];
  let lineChartInstances = [];

  function echartLineMarkup(config, className = "") {
    const encoded = encodeURIComponent(JSON.stringify(config));
    return `<div class="product-echart-line ${className}" data-echart-line="${encoded}" role="img" aria-label="${escapeHtml(config.ariaLabel || `${config.title}折线图`)}"></div>`;
  }

  function trend(extra = "") {
    const times = ["00:00", "01:30", "03:00", "04:30", "06:00", "07:30", "09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "20:00", "22:00", "24:00"];
    const config = {
      title: "压力趋势",
      yAxisTitle: "压力",
      unit: "MPa",
      times,
      warning: extra.includes("is-warning"),
      series: [
        { name: "当前周期", data: [0.238, 0.252, 0.244, 0.266, 0.254, 0.230, 0.218, 0.224, 0.194, 0.200, 0.186, 0.216, 0.222, 0.250, 0.256, 0.246] },
        { name: "阈值", data: times.map(() => 0.200), dashed: true, symbol: "none" }
      ],
      ariaLabel: "压力最近24小时趋势，支持悬浮查看各时刻具体数据"
    };
    return `<div class="product-trend ${extra}">${echartLineMarkup(config)}<span class="product-chart-note">03:20–03:45 数据缺失段</span></div>`;
  }

  function p02MetricTrend(title, unit, series, colorClass = "", yAxisTitle = "") {
    const normalizedSeries = Array.isArray(series[0]) || typeof series[0] === "object" ? series : [{ name: title.replace(/趋势$/, ""), data: series }];
    const config = {
      title,
      yAxisTitle: yAxisTitle || title.replace(/最近24小时趋势|趋势/g, ""),
      unit,
      times: p02TrendTimes,
      warning: colorClass.includes("is-warning"),
      series: normalizedSeries,
      ariaLabel: `${title}最近24小时趋势，支持悬浮查看各时刻具体数据`
    };
    return `<div class="product-metric-chart ${colorClass}"><div class="product-metric-chart-header"><strong>${title}</strong><span>单位：${unit}</span></div>${echartLineMarkup(config)}</div>`;
  }

  function initializeLineCharts(root = document) {
    lineChartInstances.forEach(instance => instance.dispose());
    lineChartInstances = [];
    if (!window.echarts) return;
    const styles = getComputedStyle(document.documentElement);
    const colors = {
      primary: styles.getPropertyValue("--color-primary").trim() || "#1677ff",
      warning: styles.getPropertyValue("--color-warning").trim() || "#faad14",
      text: styles.getPropertyValue("--color-text").trim() || "#1f1f1f",
      secondary: styles.getPropertyValue("--color-text-secondary").trim() || "#595959",
      tertiary: styles.getPropertyValue("--color-text-tertiary").trim() || "#8c8c8c",
      border: styles.getPropertyValue("--color-border-secondary").trim() || "#f0f0f0",
      background: styles.getPropertyValue("--color-bg-container").trim() || "#ffffff"
    };
    root.querySelectorAll("[data-echart-line]").forEach(element => {
      const config = JSON.parse(decodeURIComponent(element.dataset.echartLine));
      const chart = window.echarts.init(element, null, { renderer: "canvas" });
      const seriesColors = config.warning ? [colors.warning, "#ff7875"] : [colors.primary, "#13c2c2", "#722ed1"];
      chart.setOption({
        animation: false,
        color: seriesColors,
        aria: { enabled: true, label: { description: config.ariaLabel } },
        grid: { left: 70, right: 24, top: config.series.length > 1 ? 42 : 26, bottom: 58 },
        legend: { show: config.series.length > 1, top: 0, right: 4, itemWidth: 14, itemHeight: 3, textStyle: { color: colors.secondary, fontSize: 11 } },
        tooltip: {
          trigger: "axis",
          confine: true,
          axisPointer: { type: "cross", snap: true, label: { backgroundColor: colors.text } },
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderWidth: 1,
          padding: [8, 10],
          textStyle: { color: colors.text, fontSize: 12 },
          extraCssText: "box-shadow:0 6px 16px rgba(0,0,0,.12);border-radius:6px;",
          formatter(params) {
            const rows = params.map(item => `${item.marker}${escapeHtml(item.seriesName)}<span style="float:right;margin-left:18px;font-weight:600">${escapeHtml(item.value ?? "--")} ${escapeHtml(config.unit)}</span>`).join("<br>");
            return `<div style="min-width:156px"><strong>${escapeHtml(params[0]?.axisValue || "")}</strong><br>${rows}</div>`;
          }
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          name: config.xAxisTitle || "时间（时:分）",
          nameLocation: "middle",
          nameGap: 36,
          nameTextStyle: { color: colors.secondary, fontSize: 11 },
          data: config.times,
          axisLine: { show: true, lineStyle: { color: colors.tertiary } },
          axisTick: { show: true, alignWithLabel: true },
          axisLabel: { color: colors.tertiary, fontSize: 10, formatter:config.xAxisTitle?v=>config.xAxisTitle==='月份'?v:v.slice(5,16).replace(" ","\n"):undefined, interval: Math.max(0, Math.ceil(config.times.length / 6) - 1) }
        },
        yAxis: {
          type: "value",
          scale: true,
          splitNumber: 4,
          name: `${config.yAxisTitle}（${config.unit}）`,
          nameLocation: "middle",
          nameGap: 52,
          nameRotate: 90,
          nameTextStyle: { color: colors.secondary, fontSize: 11 },
          axisLine: { show: true, lineStyle: { color: colors.tertiary } },
          axisTick: { show: true },
          axisLabel: { show: true, color: colors.tertiary, fontSize: 10 },
          splitLine: { show: true, lineStyle: { color: colors.border, type: "dashed" } }
        },
        series: config.series.map((item, index) => ({
          name: item.name,
          type: "line",
          data: item.data,
          smooth: false,
          connectNulls: false,
          showSymbol: item.symbol !== "none",
          symbol: item.symbol || "circle",
          symbolSize: index ? 5 : 7,
          lineStyle: { width: item.dashed ? 1.5 : 3, type: item.dashed ? "dashed" : "solid" },
          itemStyle: { borderColor: colors.background, borderWidth: 2 },
          emphasis: { focus: "series", scale: 1.5 }
        }))
      });
      lineChartInstances.push(chart);
    });
  }

  function p02DrawerRef(type, id) {
    return `${type}:${id}`;
  }

  function p02ViewFromPage(page = state.page) {
    if (page === "p02dma") return "dma";
    if (page === "p02asset") return "assets";
    return "operations";
  }

  function isP02Page(page = state.page) {
    return ["p01", "p02", "p02dma", "p02asset", "p13", "p15"].includes(page);
  }

  function mapLevelFromZoom(zoom) {
    return Math.max(1, Math.min(18, Math.round(zoom / 10)));
  }

  function mapPointSizeAtLevel(config, level) {
    if (level <= 6) return config.low;
    if (level <= 12) return config.middle;
    return config.high;
  }

  function mapStylePresentation(context, zoom, layers) {
    const config = state.mapLayerStyles[context];
    const level = mapLevelFromZoom(zoom);
    const classes = ["product-layer-style-map"];
    const style = [
      `--map-zoom:${zoom / 100}`,
      `--pipe-main-color:${config.lines.main.color}`,
      `--pipe-main-width:${config.lines.main.width}px`,
      `--pipe-branch-color:${config.lines.branch.color}`,
      `--pipe-branch-width:${config.lines.branch.width}px`,
      `--map-label-size:${config.labels.fontSize}px`,
      `--map-label-color:${config.labels.color}`
    ];
    Object.entries(config.lines).forEach(([key, item]) => {
      if (level < item.min || level > item.max) classes.push(`is-style-hidden-${key}`);
    });
    Object.entries(config.points).forEach(([key, item]) => {
      const size = mapPointSizeAtLevel(item, level);
      style.push(`--point-${key}-radius:${size}px`, `--point-${key}-scale:${(size / 16).toFixed(3)}`);
      if (level < item.min || level > item.max) classes.push(`is-style-hidden-${key}`);
    });
    if (!layers.labels || level < config.labels.min || level > config.labels.max) classes.push("is-labels-hidden");
    return { level, className: classes.join(" "), style: style.join(";") };
  }

  function pipeClassificationDefinitions(config) {
    if (config.field === "material") return config.values.map((value, index) => ({ label: value || `未命名分类 ${index + 1}`, color: config.colors[index] }));
    const prefix = config.field === "diameter" ? "DN" : "";
    const suffix = config.field === "age" ? " 年" : "";
    return config.breaks.concat(null).map((upper, index) => {
      const lower = index ? config.breaks[index - 1] : null;
      const label = lower === null ? `${prefix}${upper}${suffix}以下` : upper === null ? `${prefix}${lower}${suffix}以上` : `${prefix}${lower}–${upper}${suffix}`;
      return { label, color: config.colors[index] };
    });
  }

  function pipeRenderProperties(id) {
    const diameters = [800, 800, 250, 600, 500, 100, 300, 150, 200, 500, 300, 150, 250, 100, 600, 400, 400, 150, 150, 100, 200, 200];
    const materials = ["球墨铸铁", "球墨铸铁", "PE", "钢管", "球墨铸铁", "PVC", "PE", "PVC", "PE", "球墨铸铁", "钢管", "PVC", "PE", "PVC", "钢管", "球墨铸铁", "钢管", "PE", "PE", "PVC", "钢管", "钢管"];
    const ages = [22, 18, 6, 28, 16, 3, 9, 4, 12, 20, 31, 5, 14, 2, 26, 11, 8, 17, 17, 24, 3, 3];
    return { diameter: diameters[id - 1], material: materials[id - 1], age: ages[id - 1] };
  }

  function pipeClassificationIndex(config, properties) {
    if (config.field === "material") {
      const index = config.values.indexOf(properties.material);
      return index < 0 ? 0 : index;
    }
    const value = properties[config.field];
    const index = config.breaks.findIndex(boundary => value < boundary);
    return index < 0 ? config.breaks.length : index;
  }

  function renderPipeClassificationLegend(context, layers) {
    if (!layers.pipes) return "";
    const config = state.pipeClassifications[context];
    const hidden = state.pipeClassHidden[context];
    const definitions = pipeClassificationDefinitions(config);
    return `<aside class="product-pipe-class-legend" aria-label="${pipeClassificationFields[config.field].label}分类渲染图例"><strong>${pipeClassificationFields[config.field].label}分类</strong>${definitions.map((item, index) => `<label><input type="checkbox" data-pipe-class-visible data-style-context="${context}" data-class-index="${index}" ${hidden.includes(index) ? "" : "checked"} /><i style="--pipe-legend-color:${item.color}"></i><span>${escapeHtml(item.label)}</span></label>`).join("")}</aside>`;
  }

  function findDma(id) {
    if(topologyReadModel){const direct=topologyReadModel.zones.find(z=>z.id===id);if(direct)return direct;const aliases={"DMA-A":0,"DMA-B":1,"DMA-C":2,"DMA-城西-01":0,"DMA-城北-01":1,"DMA-城东-02":2,"DMA-城南-03":3};if(id in aliases)return topologyReadModel.zones[Math.min(aliases[id],topologyReadModel.zones.length-1)]||null;}
    const legacyMap = { "DMA-城西-01": "DMA-A", "DMA-城北-01": "DMA-B", "DMA-城东-02": "DMA-B-2", "DMA-城南-03": "DMA-C-2" };
    return p02DmaCatalog.find(item => item.id === (legacyMap[id] || id)) || null;
  }

  function dmaChildren(parent = state.p02DmaFocus) {
    return p02DmaCatalog.filter(item => item.parent === parent);
  }

  function dmaFocusPath() {
    const path = [];
    let current = findDma(state.p02DmaFocus);
    while (current) { path.unshift(current); current = findDma(current.parent); }
    return path;
  }

  function dmaVisibleDeviceIds() {
    if(topologyReadModel){const focus=state.p02DmaFocus||p02SelectedDma()?.id;return topologyReadModel.monitors.filter(m=>!focus||m.zoneIds.includes(focus)).map(m=>m.id);}
    const focus = state.p02DmaFocus || "";
    if (focus.startsWith("DMA-A")) return ["Q-001", "P-018", "WQ-001"];
    if (focus.startsWith("DMA-B")) return ["Q-018", "P-018", "WQ-018"];
    if (focus.startsWith("DMA-C")) return ["Q-032", "P-032", "P-086", "WQ-032"];
    return p02MonitorCatalog.map(item => item.id);
  }

  function dmaMetadataEditable() {
    return !archivedMapPage() && !topologyReadModel?.history && state.selectedTopology === activeTopology()?.id;
  }

  function saveDmaMetadata(id, patch) {
    if (!dmaMetadataEditable()) throw Error('历史分区只读，请在当前在用方案中维护名称和颜色');
    const bucket = dmaBucket(), plan = bucket.items.find(item => item.id === bucket.activeId);
    const zone = plan?.zones.find(item => item.id === id);
    if (!zone) throw Error('当前方案中没有此分区');
    const name = String(patch.name ?? zone.name).trim();
    if (!name || name.length > 60) throw Error('请输入 1 至 60 字的分区名称');
    const color = patch.color ?? zone.color ?? state.dmaZoneColors[id];
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('请选择有效的分区颜色');
    Object.assign(zone, { name, color });
    plan.updated = new Date().toLocaleString('sv-SE');
    persistTopologyStore();
    state.dmaZoneColors[id] = color;
  }

  function dmaSelectedMonth(){return state.dmaMonths?.[state.activeProjectId+'|'+state.selectedTopology] || window.DMAStatistics.previous();}

  function dmaDemoEnabled(){return !archivedMapPage()&&(isCampusProject()||state.activeProjectId==='PRJ-001'&&topologyStore().hangzhouExamples?.target===state.selectedTopology);}

  function dmaDeviceSummary(zone) {
    const model = topologyReadModel;
    if (!model) return { count: 0, pressure: null, pressureCount: 0, pressureTotal: 0, pressureTime: '' };
    const monitors = model.monitors.filter(m => m.zoneIds?.includes(zone.id) && model.objects.has(m.hostId));
    const members = new Set([...zone.nodeIds, ...zone.pipeIds, zone.id]);
    const ids = new Set(monitors.flatMap(m => m.devices?.length ? m.devices : [m.id]));
    (model.data.businessDeviceLinks || []).filter(d => members.has(d.hostId)).forEach(d => ids.add(d.id));
    const pressureMonitors = monitors.filter(m => m.type === 'pressure');
    const pressureIds = new Set(pressureMonitors.flatMap(m => m.devices?.length ? m.devices : [m.id]));
    const pressureById = new Map(), devices = deviceBinding().devices;
    const addPressure = (id, value, quality, unit, time) => {
      const stamp = String(time || '').trim().replace(' ', 'T');
      const epoch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stamp) ? Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(stamp) ? stamp : stamp + '+08:00') : NaN;
      if (quality === 'GOOD' && unit === 'MPa' && value !== null && value !== '' && Number.isFinite(Number(value)) && Number.isFinite(epoch)) {
        pressureById.set(id, { value: Number(value), time: epoch });
      }
    };
    pressureMonitors.forEach(m => {
      if (m.devices?.length) m.devices.forEach(id => {
        const d = devices.find(d => d.id === id);
        if (d?.status === '启用' && d.online === '在线') addPressure(id, d.value, d.quality, d.unit, d.sampleTime);
      });
      else addPressure(m.id, m.numeric, m.quality, m.unit, m.sampleTime);
    });
    const samples = [...pressureById.values()], time = samples.length ? Math.max(...samples.map(s => s.time)) : null;
    const valid = samples.filter(s => s.time === time);
    return { count: ids.size, pressure: valid.length ? valid.reduce((sum, s) => sum + s.value, 0) / valid.length : null, pressureCount: valid.length, pressureTotal: pressureIds.size, pressureTime: time == null ? '' : new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + '（北京时间）' };
  }

  function dmaQuantity(value, unit = 'm³') {
    return value == null || value === '' || !Number.isFinite(Number(value)) ? '--' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + (unit ? ' ' + unit : '');
  }

  function renderDmaPolygons(layerHidden, options = {}) {
    const history = options.historyKind === "dma";
    const zones = options.comparison || history ? p02DmaCatalog.filter(item => item.parent === null) : dmaChildren();
    const selected = options.comparison || history ? null : p02SelectedDma();
    const action = options.comparison ? "select-compare-object" : history ? "history-select" : "select-dma";
    return `<g class="product-dma-zones${layerHidden("dma")}" aria-label="当前层级 DMA 分区">${zones.map(zone => { const actionLabel = options.comparison ? `查看${zone.id}属性对比` : history ? `查看${zone.id}历史快照` : dmaChildren(zone.id).length ? `进入${zone.id}下一级分区` : `查看${zone.id}分区指标`; const isSelected = options.comparison ? state.p08Selected === zone.id : history ? state.historySelection.dma === zone.id : selected && selected.id === zone.id; const historyAttr = history ? ' data-history-kind="dma"' : ""; return `<path class="product-dma-zone ${isSelected ? "is-selected" : ""}" style="--dma-zone-color:${state.dmaZoneColors[zone.id]}" d="${zone.path}" data-action="${action}" data-value="${zone.id}"${historyAttr} tabindex="0" role="button" aria-label="${actionLabel}"></path><text class="product-zone-label product-dma-zone-label" x="${zone.labelX}" y="${zone.labelY}" data-action="${action}" data-value="${zone.id}"${historyAttr} tabindex="0" role="button" aria-label="${actionLabel}">${zone.id.replace("DMA-", "")}</text>`; }).join("")}</g>`;
  }

  function renderDmaMapNavigation() {
    const path = dmaFocusPath();
    const zones = dmaChildren();
    const level = zones[0]?.level || (path.at(-1)?.level || 0) + 1;
    return `<div class="product-dma-month-filter"><label for="dmaStatMonth">统计月份</label><input id="dmaStatMonth" class="app-input" type="month" value="${dmaSelectedMonth()}" aria-label="统计月份"></div><div class="product-dma-map-navigation" aria-label="DMA 分区层级导航"><div><strong>${level <= 3 ? `${level}级分区` : "末级分区"}</strong><span>${zones.length} 个当前分区</span></div><nav><button type="button" data-action="dma-root" ${path.length ? "" : "disabled"}>全部</button>${path.map((item, index) => `<span>/</span><button type="button" data-action="dma-focus" data-value="${item.id}" ${index === path.length - 1 ? "disabled" : ""}>${escapeHtml(isCampusProject()?item.name:item.id.replace("DMA-", ""))}</button>`).join("")}</nav>${path.length ? `<button class="app-button app-button-small" type="button" data-action="dma-up">返回上级</button>` : ""}</div>`;
  }

  function p02SelectedDma() {
    const drawerDmaId = typeof state.p02Drawer === "string" && state.p02Drawer.startsWith("dma:") ? state.p02Drawer.slice(4) : null;
    const selectedDmaId = state.p02SelectedObjects.find(item => item.startsWith("DMA-"));
    return findDma(drawerDmaId || selectedDmaId);
  }

  let liveTopologyEditor;
  let topologyReadModel, topologyReadRenderer;
  const archivedMapPage = () => /^(p06h|p10h|p13h|p15h)$/.test(state.page);
  function topologyEditor() {
    if (!liveTopologyEditor) liveTopologyEditor = new window.WaterTopologyEditor({render, toast: showToast, icon: topologyCheckIcon, dirty: value => { state.p04Dirty = value; },onSave:(key,data)=>{
      if(!key.includes(':dma:'))return;
      const [,version,,id]=key.split(':');const bucket=topologyStore().dmaPlans?.[version],plan=bucket?.items.find(p=>p.id===id);
      if(!plan||bucket.activeId===id)throw Error('在用方案只读，请复制后编辑');
      liveTopologyEditor.validate(data);liveTopologyEditor.validateSpatial(data);plan.zones=JSON.parse(JSON.stringify(data.zones));plan.updated=new Date().toLocaleString('sv-SE');persistTopologyStore();
    }});
    const project = state.activeProjectId || "PRJ-001", legacy = state.selectedTopology === "T0";
    const key = `${project}:${legacy ? "T0" : state.selectedTopology || "T3"}`;
    if (liveTopologyEditor.key !== key) {
      const markup=baseNetworkMap({points:false,assetView:true});
      let data=project===window.SuizhouProject?.projectId && state.selectedTopology===window.SuizhouProject.topologyId?window.SuizhouProject.snapshot():undefined;
      if(project===window.CampusProject?.projectId&&state.selectedTopology===window.CampusProject.topologyId)data=window.CampusProject.snapshot();
      if(legacy){
        const archived=localStorage.getItem(`water-editor:${project}:T0`),backup=localStorage.getItem(`water-editor-backup:${project}:T3:before-city-20260910`);
        try{data=liveTopologyEditor.validate(JSON.parse(archived||backup));}catch(_){data=liveTopologyEditor.seed(markup,true);}
        data.sampleRevision="legacy-20260910";
        if(!archived)localStorage.setItem(`water-editor:${project}:T0`,JSON.stringify(data));
      }
      liveTopologyEditor.use(key,markup,{data,readOnly:legacy,preserve:legacy||state.selectedTopology!=="T3"});
    }
    return liveTopologyEditor;
  }
  let hydraulicUI;
  function hydraulics(){
    if(!hydraulicUI) hydraulicUI=window.createHydraulicsUI(()=>({project:state.activeProjectId,refresh:render,navigate,icon:navIcon,versions:topologyStore().versions,active:activeTopology()?.id,
      inputs:topologyReadModel.monitors.filter(m=>m.devices),
      snapshot(id){const raw=localStorage.getItem(`water-editor:${state.activeProjectId}:${id}`);if(raw)return JSON.parse(raw);if(state.activeProjectId===window.SuizhouProject?.projectId&&id===window.SuizhouProject.topologyId)return window.SuizhouProject.snapshot();if(state.activeProjectId===window.CampusProject?.projectId&&id===window.CampusProject.topologyId)return window.CampusProject.snapshot();if(id===state.selectedTopology)return topologyReadModel.data;throw Error('该拓扑版本暂无已保存的数据');}
    }));return hydraulicUI;
  }
  let v2UI;
  function v2Platform(){
    if(!v2UI)v2UI=window.createV2UI(()=>({project:state.activeProjectId,page:state.page,version:state.productVersion,refresh:render,navigate,icon:navIcon,toast:showToast,hydraulics,
      versions:topologyStore().versions,active:activeTopology()?.id,inputs:topologyReadModel.monitors.filter(m=>m.devices),
      snapshot(id){const raw=localStorage.getItem(`water-editor:${state.activeProjectId}:${id}`);if(raw)return JSON.parse(raw);if(state.activeProjectId===window.SuizhouProject?.projectId&&id===window.SuizhouProject.topologyId)return window.SuizhouProject.snapshot();if(state.activeProjectId===window.CampusProject?.projectId&&id===window.CampusProject.topologyId)return window.CampusProject.snapshot();if(id===state.selectedTopology)return topologyReadModel.data;throw Error('该拓扑版本暂无已保存的数据');},
      orders(){return operations().load().orders;},
      openOrder(id){const o=operations().load().orders.find(o=>o.id===id);operations().open(window.WaterOperations.terminal(o)?'p15h':'p15',id);},
      dispatch(plan){
        if(plan.topology!==activeTopology()?.id)throw Error('计划拓扑与在用拓扑不同，请基于在用拓扑重新复核');
        const O=window.WaterOperations,db=operations().load();
        const old=db.orders.find(o=>o.planId===plan.id&&o.status!=='已取消');if(old)return old;
        const order=O.createOrder(db,{name:plan.name,hostId:plan.hostId,assignee:plan.assignee,dueAt:plan.dueAt,priority:'普通',instructions:plan.instructions,topology:plan.topology,planId:plan.id,sourceRunId:plan.runId},topologyReadModel.data);
        O.transition(db,order.id,'dispatch',{assignee:plan.assignee,note:'管控计划审核通过'});
        localStorage.setItem(`water-operations:v1:${state.activeProjectId}`,JSON.stringify(db));return order;
      }
    }));return v2UI;
  }
  const isHydraulicPage=page=>['hydraulic', 'hydraulicTrial', 'hydraulicResults', 'simulation', 'hydraulicModel', 'valveAnalysis', 'emergency', 'burstAnalysis', 'agingAnalysis', 'leakAnalysis', 'qualityModel', 'qualityScenes', 'qualityEvent', 'qualityMap', 'hydraulicHistory', 'qualityHistory', 'modelReview', 'calculationCenter', 'resultCompare', 'controlPlans'].includes(page);
  let operationsUI = null;
  function operations() {
    if (!operationsUI) operationsUI = window.createOperationsUI(() => ({
      project: state.activeProjectId, topology: state.selectedTopology, activeTopology: activeTopology()?.id,
      model: topologyReadModel, refresh: render, navigate,
      drawMap(events, selected, kind) {
        if(state.opsMapPage!==state.page || state.opsMapSelected!==selected){state.opsMapFocus=null;state.opsMapZoom=100;state.opsMapPage=state.page;state.opsMapSelected=selected;}
        topologyReadModel.events.splice(0,topologyReadModel.events.length,...events);
        state.p02SelectedObjects=selected?[selected]:[];
        const layers={basemap:true,pipes:true,nodes:false,valves:true,plants:true,pumps:true,users:true,hydrants:true,noise:true,labels:true,alarms:kind==='alarm',workorders:kind==='work'};
        const wrap=document.createElement('div');wrap.innerHTML=networkMap({layers,points:false,operations:true,expanded:true});
        const svg=wrap.querySelector('svg');
        const pos=topologyReadModel.position(state.opsMapFocus||selected), zoom=state.opsMapZoom||100;
        const width=900/(zoom/100),height=540/(zoom/100),center=pos||[450,270];
        svg.setAttribute('viewBox',`${center[0]-width/2} ${center[1]-height/2} ${width} ${height}`);
        svg.querySelectorAll('[data-action]').forEach(el=>{if(!el.closest('.product-ops-marker')){el.removeAttribute('data-action');el.removeAttribute('role');el.removeAttribute('tabindex');}});
        svg.querySelectorAll('.product-ops-marker').forEach(el=>{const e=events.find(e=>e.id===el.dataset.value);if(e){el.insertAdjacentHTML('afterbegin',`<rect class="ops-event-hit" x="-14" y="-14" width="${36+e.name.length*11}" height="28" fill="transparent" stroke="none" pointer-events="all"/>`);el.insertAdjacentHTML('beforeend',`<text class="ops-event-label" x="15" y="4">${escapeHtml(e.name)}</text>`);}});
        return wrap.innerHTML;
      },
      mapView(action){if(action==='map-reset')state.opsMapFocus='full';state.opsMapZoom=action==='map-reset'?100:Math.max(60,Math.min(260,(state.opsMapZoom||100)+(action==='map-zoom-in'?20:-20)));render();},
      focusMap(id){state.opsMapFocus=id;state.opsMapZoom=160;render();},
      locate(id) { const object=topologyReadModel.objects.get(id); if(!object){showToast('关联对象已移除','warning');return;} navigate('p02asset');state.p02Drawer=p02DrawerRef(object.type==='pipe'?'pipe':'asset',id);state.p02SelectedObjects=[id];state.p02DrawerTab='basic';render(); }
    }));
    return operationsUI;
  }
  function ensureHangzhouExamples(store){
    const H=window.HangzhouExamples;if(state.activeProjectId!==H?.projectId||store.hangzhouExamples?.revision===H.revision)return;
    const source=activeTopology();state.selectedTopology=source.id;const editor=topologyEditor(),data=JSON.parse(JSON.stringify(editor.s.saved));
    const bucket=store.dmaPlans?.[source.id];if(bucket)data.zones=JSON.parse(JSON.stringify(bucket.items.find(p=>p.id===bucket.activeId)?.zones||data.zones));
    const project=state.activeProjectId,read=(key,fallback)=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;};
    const devices=deviceBindingUI?.projects.get(project)||read('water-devices:'+project,window.WaterDeviceBinding.seed());
    const result=H.build({data,store,devices,operations:read('water-operations:v1:'+project,window.WaterOperations.empty()),standard:read('water-standard:'+project,{balances:[],reports:[],imports:[],rule:null})});
    editor.validate(result.data);
    const writes=[[`water-editor:${project}:${result.version}`,result.data],['water-devices:'+project,result.devices],['water-operations:v1:'+project,result.operations],['water-standard:'+project,result.standard],['water-topology-store:'+project,result.store]];
    const before=writes.map(([key])=>[key,localStorage.getItem(key)]);
    try{for(const [key,value] of writes)localStorage.setItem(key,JSON.stringify(value));}catch(e){for(const [key,value] of before){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}throw e;}
    Object.assign(store,result.store);if(deviceBindingUI)deviceBindingUI.projects.set(project,result.devices);state.selectedTopology=result.version;
  }
  function syncTopologyReadModel() {
    const store=topologyStore();
    if(!store.connectionRepair20260914){
      const source=activeTopology();
      if(source){
        state.selectedTopology=source.id;
        const original=JSON.parse(JSON.stringify(topologyEditor().s.saved));
        const repaired=window.repairTopologyConnections(original);
        const id='T'+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))||0))+1);
        const now=new Date().toLocaleString('sv-SE');
        localStorage.setItem(`water-editor:${state.activeProjectId}:${source.id}`,JSON.stringify(original));
        localStorage.setItem(`water-editor:${state.activeProjectId}:${id}`,JSON.stringify(repaired));
        window.WaterDeviceBinding.inherit(store,source.id,id);
        source.status='已发布';store.comparisonBaseline=source.id;
        store.versions.push({id,name:'城市主干管网 · 连通修复版',status:'使用中',published:now,source:source.id});
        store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);store.epochs.push({topology:id,start:now,end:null});
        store.connectionRepair20260914={source:source.id,target:id};
        state.selectedTopology=id;state.compareBaseline=source.id;
        persistTopologyStore();
      }
    }
    if(!store.terminalRepair20260914){
      const source=activeTopology();state.selectedTopology=source.id;
      const fixed=window.normalizeTopologyTerminals(topologyEditor().s.saved);
      const id='T'+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))||0))+1),now=new Date().toLocaleString('sv-SE');
      localStorage.setItem(`water-editor:${state.activeProjectId}:${id}`,JSON.stringify(fixed));
      window.WaterDeviceBinding.inherit(store,source.id,id);source.status='已发布';
      store.versions.push({id,name:'城市主干管网 · 末端规范版',status:'使用中',published:now,source:source.id});
      store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);store.epochs.push({topology:id,start:now,end:null});
      store.terminalRepair20260914={source:source.id,target:id};state.selectedTopology=id;persistTopologyStore();
    }
    if(!store.logisticsRepair20260914){
      const source=activeTopology();state.selectedTopology=source.id;
      const fixed=window.repairLogisticsBranch(topologyEditor().s.saved);
      const id='T'+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))||0))+1),now=new Date().toLocaleString('sv-SE');
      localStorage.setItem(`water-editor:${state.activeProjectId}:${id}`,JSON.stringify(fixed));
      window.WaterDeviceBinding.inherit(store,source.id,id);source.status='已发布';
      store.versions.push({id,name:'城市主干管网 · 支路修正版',status:'使用中',published:now,source:source.id});
      store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);store.epochs.push({topology:id,start:now,end:null});
      store.logisticsRepair20260914={source:source.id,target:id};state.selectedTopology=id;persistTopologyStore();
    }
    if(!store.northwestUsers20260914){
      const source=activeTopology();state.selectedTopology=source.id;
      const fixed=window.addNorthwestUsers(topologyEditor().s.saved);
      const id='T'+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))||0))+1),now=new Date().toLocaleString('sv-SE');
      localStorage.setItem(`water-editor:${state.activeProjectId}:${id}`,JSON.stringify(fixed));
      window.WaterDeviceBinding.inherit(store,source.id,id);source.status='已发布';
      store.versions.push({id,name:'城市主干管网 · 西北用户完善版',status:'使用中',published:now,source:source.id});
      store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);store.epochs.push({topology:id,start:now,end:null});
      store.northwestUsers20260914={source:source.id,target:id};state.selectedTopology=id;persistTopologyStore();
    }
    if(!store.versionCleanupT8 && !store.interiorUsers20260914 && store.versions.some(v=>v.id==='T8') && store.versions.some(v=>v.id==='T3')){
      localStorage.setItem('water-version-cleanup-backup:'+state.activeProjectId,JSON.stringify(store));
      store.versions=store.versions.filter(v=>['T3','T8'].includes(v.id));
      store.versions.forEach(v=>v.status=v.id==='T8'?'使用中':'已发布');
      store.comparisonBaseline='T3';store.versionCleanupT8=true;
      state.selectedTopology='T8';state.compareBaseline='T3';persistTopologyStore();
    }
    if(!store.interiorUsers20260914){
      const source=activeTopology();state.selectedTopology=source.id;
      const base=topologyEditor().s.saved,fixed=window.addInteriorUsers(base);
      const id='T'+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))||0))+1),now=new Date().toLocaleString('sv-SE');
      const plans=window.DMAPlans.ensure(store,source.id,base);
      store.dmaPlans[id]=JSON.parse(JSON.stringify(plans));
      store.dmaPlans[id].items.forEach(plan=>{plan.zones=window.addInteriorUsers({...base,zones:plan.zones}).zones;});
      fixed.zones=JSON.parse(JSON.stringify(store.dmaPlans[id].items.find(p=>p.id===plans.activeId).zones));
      localStorage.setItem(`water-editor:${state.activeProjectId}:${id}`,JSON.stringify(fixed));
      window.WaterDeviceBinding.inherit(store,source.id,id);source.status='已发布';
      store.versions.push({id,name:'城市管网 · 内部用户与分级管径版',status:'使用中',published:now,source:source.id});
      store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);store.epochs.push({topology:id,start:now,end:null});
      store.interiorUsers20260914={source:source.id,target:id};state.selectedTopology=id;persistTopologyStore();
    }
    ensureHangzhouExamples(store);
    if(!['p03','p04','p07','p08','p09','p12'].includes(state.page))state.selectedTopology=activeTopology()?.id;
    if(state.topologyContextProject!==state.activeProjectId || !selectedTopology()) {
      state.topologyContextProject=state.activeProjectId;
      state.selectedTopology=activeTopology()?.id || topologyStore().versions[0]?.id;
    }
    const editor=topologyEditor();
    const dmaContext=state.activeProjectId+'|'+state.selectedTopology;
    if(state.dmaContext!==dmaContext){state.dmaContext=dmaContext;state.dmaPlanId=null;state.dmaCompareA=null;state.dmaCompareB=null;state.dmaCompareZone=null;state.dmaPlanForm=null;state.dmaActivate=null;}
    const plans=window.DMAPlans.ensure(store,state.selectedTopology,editor.s.saved);
    persistTopologyStore();
    const readData=['p04','p08','p09'].includes(state.page)?editor.s.saved:{...editor.s.saved,zones:plans.items.find(p=>p.id===plans.activeId)?.zones||[]};
    topologyReadRenderer=Object.create(editor);
    topologyReadRenderer.s={...editor.s,data:readData,tab:"layers",selected:null,view:[0,0,900,540]};
    topologyReadModel=window.TopologyMapData.build({...readData,businessProjectId:state.activeProjectId},topologyReadRenderer,editor.s.readOnly);
    if(!archivedMapPage()){
      const ui=deviceBinding();
      topologyStore().bindings.filter(b=>b.key.split('|')[0]===state.selectedTopology).forEach(b=>{
        const [,hostId,type]=b.key.split('|'),host=topologyReadModel.objects.get(hostId),pos=topologyReadModel.position(hostId),metric=window.WaterDeviceBinding.metrics[type];
        if(!metric)return;
        const a=window.WaterDeviceBinding.aggregate({...b,metric:type},ui.devices);
        topologyReadModel.monitors.push({id:`BIND-${hostId}-${type}`,type,name:`${host?.name||hostId} · ${metric[0]}聚合`,hostId,zoneIds:host?.type==='zone'?[hostId]:topologyReadModel.zoneFor(hostId),x:pos?.[0]??null,y:pos?.[1]??null,numeric:a.value,unit:a.unit||metric[1],value:pos&&a.value!==null?`${a.value} ${a.unit||metric[1]}`:'—',quality:!pos?'UNBOUND':a.value===null?'MISSING':a.excluded?'PARTIAL':'GOOD',location:host?`${host.id} · ${host.name}`:'对象已删除',devices:[...b.devices],rule:b.rule,sampleTime:a.time});
      });
    }
    topologyReadModel.data.businessDeviceLinks=topologyStore().bindings.filter(b=>b.key.split('|')[0]===state.selectedTopology).flatMap(b=>b.devices.map(id=>{const d=deviceBinding().devices.find(d=>d.id===id);return {hostId:b.key.split('|')[1],id,name:d?.name||id};}));
    topologyReadModel.data.businessMonitoring=topologyReadModel.monitors;
    const standardRaw=localStorage.getItem('water-standard:'+state.activeProjectId);
    const standard=standardRaw?JSON.parse(standardRaw):{balances:[],reports:[],imports:[]},D=window.DMAStatistics;
    if(dmaDemoEnabled()){window.DMADemo.seed(standard,state.selectedTopology,topologyReadModel.zones);window.DMADemo.monitors(topologyReadModel);}
    const month=dmaSelectedMonth();
    for (const b of D.monthly(standard,state.selectedTopology,topologyReadModel.zones,month,month)) {
      const z = topologyReadModel.zones.find(z => z.id === b.zoneId);
      z.balance = b;
      z.deviceSummary = dmaDeviceSummary(z);
      z.pressure = dmaQuantity(z.deviceSummary.pressure, 'MPa');
      z.leakage = b.rate == null ? '--' : b.rate.toFixed(2) + '%';
      z.inletTotal = dmaQuantity(b.inlet);
      z.outletTotal = dmaQuantity(b.outlet);
    }

    const records=operations().load();
    topologyReadModel.events.splice(0,topologyReadModel.events.length,
      ...records.alarms.filter(a=>a.status!=='已关闭'&&a.topology===state.selectedTopology).map(a=>({...a,type:'alarm'})),
      ...records.orders.filter(w=>!window.WaterOperations.terminal(w)&&w.topology===state.selectedTopology).map(w=>({...w,type:'workorder'})));
    p02PipeCatalog.splice(0,p02PipeCatalog.length,...topologyReadModel.pipes);
    p02AssetCatalog.splice(0,p02AssetCatalog.length,...topologyReadModel.assets);
    p02DmaCatalog.splice(0,p02DmaCatalog.length,...topologyReadModel.zones);
    p02MonitorCatalog.splice(0,p02MonitorCatalog.length,...topologyReadModel.monitors);
    state.dmaZoneColors = Object.fromEntries(p02DmaCatalog.map((z,i) => [z.id, /^#[0-9a-f]{6}$/i.test(z.color || '') ? z.color : createDmaZoneColors()[z.id] || ["#3997bf","#46a895","#8c9dd2","#d0a15c"][i%4]]));
    bindingObjects.splice(0,bindingObjects.length,...topologyReadModel.assets.filter(a=>["水厂","泵站","阀门","用户端","消火栓"].includes(a.type)).map(a=>({id:a.id,name:a.name})));
    if(!bindingObjects.some(o=>o.id===state.bindingObject)){state.bindingObject=bindingObjects[0]?.id||"";state.bindingDraft=null;}
    const container=document.querySelector(".product-context");
    let selector=document.getElementById("topologyViewSelect");
    if(!selector){const wrap=document.createElement("label");wrap.className="unified-version-control";wrap.innerHTML='<span>拓扑</span><select id="topologyViewSelect" aria-label="查看拓扑版本"></select>';container.append(wrap);selector=wrap.querySelector("select");}
    selector.innerHTML=topologyStore().versions.map(v=>`<option value="${escapeHtml(v.id)}">${escapeHtml(v.id+' · '+v.name+' · '+(v.id==='T0'?'历史只读':v.status))}</option>`).join("");
    selector.value=state.selectedTopology;selector.disabled=archivedMapPage();
  }
  function networkMap(options = {}) {
    if(options.comparison||!topologyReadModel)return baseNetworkMap(options);
    const selected=state.page==='p10'?[state.p10UserSelected||state.p10Selected]:state.p02SelectedObjects;
    const highlight=[...selected];
    selected.forEach(id=>{const m=topologyReadModel.monitors.find(m=>m.id===id),e=topologyReadModel.events.find(e=>e.id===id);if(m?.hostId)highlight.push(m.hostId);if(e?.hostId)highlight.push(e.hostId);const z=topologyReadModel.zones.find(z=>z.id===id);if(z)highlight.push(...z.nodeIds,...z.pipeIds);});
    const wrapper=document.createElement('div');wrapper.innerHTML=topologyReadRenderer.map(true,{...options,selectedIds:highlight});
    const svg=wrapper.querySelector('svg');
    svg.classList.add('unified-topology-svg');
    const config=options.classificationContext?state.pipeClassifications[options.classificationContext]:null;
    svg.querySelectorAll('[data-pipe-id]').forEach(el=>{const p=topologyReadModel.objects.get(el.dataset.pipeId);el.classList.add(p.diameter>=800?'is-main-line':'is-branch-line');if(highlight.includes(p.id))el.classList.add('is-selected');if(config){const idx=pipeClassificationIndex(config,{...p,age:p.age??8});el.classList.add('is-pipe-classified',`is-pipe-class-${idx}`);el.style.setProperty('--pipe-class-color',config.colors[idx]);if(state.pipeClassHidden[options.classificationContext].includes(idx))el.classList.add('is-pipe-class-hidden');}});
    svg.querySelectorAll('[data-value]').forEach(el=>{if(highlight.includes(el.dataset.value))el.classList.add('is-selected');});
    svg.querySelectorAll('.we-zone').forEach(el=>{el.style.fill=(state.dmaZoneColors[el.dataset.value]||'#3997bf')+'25';el.style.stroke=state.dmaZoneColors[el.dataset.value]||'#3997bf';el.parentElement.classList.add('product-dma-zones');});
    if(options.layers?.labels===false)svg.querySelectorAll('.we-node text').forEach(el=>el.remove());
    if(options.dma&&options.layers?.labels!==false)svg.insertAdjacentHTML('beforeend',topologyReadModel.zones.map(z=>`<text class="unified-zone-label" x="${z.labelX}" y="${z.labelY}" data-action="select-dma" data-value="${z.id}">${escapeHtml(z.name)}</text>`).join(''));
    svg.insertAdjacentHTML('beforeend',window.TopologyMapData.overlay(topologyReadModel,{...options,selectedIds:selected}));
    return wrapper.innerHTML;
  }
  function baseNetworkMap(options = {}) {
    const diff = options.diff || "";
    const points = options.points !== false;
    const layers = options.layers || {};
    const layerHidden = key => options.layers && !layers[key] ? " is-layer-hidden" : "";
    const checkIssue = options.checkIssue || null;
    const selectedClass = id => {
      const selected = (isP02Page() && state.p02SelectedObjects.includes(id)) || (state.page === "p10" && state.p10Selected === id) || (options.comparison && state.p08Selected === id) || (options.historyKind && state.historySelection[options.historyKind] === id);
      const checked = checkIssue?.mapPoints?.includes(id);
      return `${selected ? " is-selected" : ""}${checked ? " is-check-object" : ""}`;
    };
    const selectedDma = p02SelectedDma();
    const pipeClass = id => {
      const pipeId = `PIPE-2026-${String(id).padStart(3, "0")}`;
      const selected = isP02Page() && state.p02SelectedObjects.includes(pipeId) || options.comparison && state.p08Selected === pipeId ? " is-selected" : "";
      if (diff === "topology") {
        if (id === 6) return `is-added${selected}`;
        if (id === 9) return `is-removed${selected}`;
        if (id === 3 || id === 16) return `is-moved${selected}`;
        return `is-common${selected}`;
      }
      if (diff === "dma") return [5, 8, 10].includes(id) ? `is-moved${selected}` : `is-common${selected}`;
      return selected;
    };
    const mainPipes = [1, 2, 4, 10, 15, 16, 17];
    const classification = options.classificationContext ? state.pipeClassifications[options.classificationContext] : null;
    const hiddenPipeClasses = options.classificationContext ? state.pipeClassHidden[options.classificationContext] : [];
    const pipe = (id, path, label) => {
      const pipeId = `PIPE-2026-${String(id).padStart(3, "0")}`;
      const properties = pipeRenderProperties(id);
      const classIndex = classification ? pipeClassificationIndex(classification, properties) : -1;
      const category = classification ? ` is-pipe-classified is-pipe-class-${classIndex}${hiddenPipeClasses.includes(classIndex) ? " is-pipe-class-hidden" : ""}` : "";
      const classColor = classification ? ` style="--pipe-class-color:${classification.colors[classIndex]}"` : "";
      const checkClass = checkIssue?.mapPipes?.includes(id) ? " is-check-object" : "";
      return `<path class="product-topology-pipe ${mainPipes.includes(id) ? "is-main-line" : "is-branch-line"}${category} ${pipeClass(id)}${checkClass}"${classColor} d="${path}" data-action="${options.comparison ? "select-compare-object" : "select-pipe"}" data-value="${pipeId}" data-pipe-id="${pipeId}" data-diameter="DN${properties.diameter}" data-material="${properties.material}" data-age="${properties.age}" tabindex="0" role="button" aria-label="${options.comparison ? `查看${label}属性对比` : `选择管线 ${label}`}"></path>`;
    };
    const assetAttrs = (id, label) => options.comparison ? `data-action="select-compare-object" data-value="${id}" tabindex="0" role="button" aria-label="查看${label}属性对比"` : options.assetView ? `data-action="select-asset" data-value="${id}" tabindex="0" role="button" aria-label="查看资产 ${label}"` : `role="img" aria-label="${label}"`;

    return `<div class="product-network">
      <svg class="product-topology-svg" viewBox="${options.expanded ? "18 35 844 490" : "0 0 900 540"}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="从水厂经泵站、阀门和连接节点到用户端的供水管网拓扑图">
        <g class="product-pipe-network${layerHidden("pipes")}" aria-label="连续供水管线">
          ${pipe(1, "M102 274H182", "水厂出厂管")}
          ${pipe(2, "M182 274H302", "泵站出水主干管")}
          ${pipe(3, "M302 274 368 204", "西北支干管（终点未连接）")}
          ${pipe(4, "M404 170H544", "北部主干管")}
          ${pipe(5, "M544 170 682 116", "北区供水支管")}
          ${pipe(6, "M682 116 810 92", "北区用户接入管")}
          ${pipe(7, "M544 170 682 230", "东北供水支管")}
          ${pipe(8, "M682 230H810", "东北用户接入管")}
          ${pipe(9, "M302 274 404 382", "西南支干管")}
          ${pipe(10, "M404 382H544", "南部主干管")}
          ${pipe(11, "M544 382 682 330", "东南供水支管")}
          ${pipe(12, "M682 330H810", "东南用户接入管")}
          ${pipe(13, "M544 382 682 462", "南区供水支管")}
          ${pipe(14, "M682 462 810 478", "南区用户接入管")}
          ${pipe(15, "M302 274H470", "中部联络管")}
          ${pipe(16, "M470 274 544 170", "北部联络管")}
          ${pipe(17, "M470 274 544 382", "南部联络管")}
          ${pipe(18, "M175 80 245 55", "西北孤岛管线一")}
          ${pipe(19, "M245 55 285 115", "西北孤岛管线二")}
          ${pipe(20, "M285 115 175 80", "西北孤岛管线三")}
          ${pipe(21, "M230 470 315 485", "西南临时管一")}
          ${pipe(22, "M315 485 350 520", "西南临时管二")}
        </g>
        ${options.dma ? renderDmaPolygons(layerHidden, options) : ""}
        <g class="product-water-plant${layerHidden("plants")}${selectedClass("PLANT-001")}" transform="translate(58 246)" ${assetAttrs("PLANT-001", "第一水厂")}>
          <rect class="product-asset-surface" width="44" height="56" rx="4"></rect><path class="product-asset-line" d="M8 44V18l9 6V12l9 6V8h10v36M5 44h34"></path><text class="product-asset-label" x="22" y="70">第一水厂</text>
        </g>
        <g class="product-pump-station${layerHidden("pumps")}${selectedClass("PUMP-001")}" transform="translate(182 274)" ${assetAttrs("PUMP-001", "城西加压泵站")}>
          <circle class="product-node-surface" r="18"></circle><path class="product-asset-line" d="M-8 5c6-13 14-13 20-2M-8 5h20"></path><text class="product-node-symbol" x="0" y="-24">泵站</text>
        </g>
        <g class="product-junction-node${layerHidden("nodes")}${selectedClass("NODE-J01")} ${state.p02FocusedNode === "J-01" ? "is-selected" : ""}" transform="translate(302 274)" ${assetAttrs("NODE-J01", "连接点 J-01")}><circle r="7"></circle><text x="10" y="-10">J-01</text></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V101")}" transform="translate(404 170)" ${assetAttrs("VALVE-V101", "阀门 V-101")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle><text x="14" y="-8">V-101</text></g>
        <g class="product-junction-node${layerHidden("nodes")}${selectedClass("NODE-J02")} ${state.p02FocusedNode === "J-02" ? "is-selected" : ""}" transform="translate(544 170)" ${assetAttrs("NODE-J02", "连接点 J-02")}><circle r="7"></circle><text x="10" y="-10">J-02</text></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V201")}" transform="translate(682 116)" ${assetAttrs("VALVE-V201", "阀门 V-201")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V202")}" transform="translate(682 230)" ${assetAttrs("VALVE-V202", "阀门 V-202")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle></g>
        <g class="product-junction-node${layerHidden("nodes")}${selectedClass("NODE-J03")} ${state.p02FocusedNode === "J-03" ? "is-selected" : ""}" transform="translate(470 274)" ${assetAttrs("NODE-J03", "连接点 J-03")}><circle r="7"></circle><text x="10" y="-10">J-03</text></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V301")}" transform="translate(404 382)" ${assetAttrs("VALVE-V301", "阀门 V-301")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle><text x="14" y="-8">V-301</text></g>
        <g class="product-junction-node${layerHidden("nodes")}${selectedClass("NODE-J04")} ${state.p02FocusedNode === "J-04" ? "is-selected" : ""}" transform="translate(544 382)" ${assetAttrs("NODE-J04", "连接点 J-04")}><circle r="7"></circle><text x="10" y="18">J-04</text></g>
        <g class="product-junction-node product-problem-node${selectedClass("NODE-ISO-01")}" transform="translate(620 82)" ${assetAttrs("NODE-ISO-01", "孤立连接点 NODE-ISO-01")}><circle r="7"></circle><text x="10" y="-10">ISO-01</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I01")}" transform="translate(175 80)" ${assetAttrs("NODE-I01", "孤岛节点 I01")}><circle r="6"></circle><text x="-8" y="-10">I01</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I02")}" transform="translate(245 55)" ${assetAttrs("NODE-I02", "孤岛节点 I02")}><circle r="6"></circle><text x="8" y="-9">I02</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I03")}" transform="translate(285 115)" ${assetAttrs("NODE-I03", "孤岛节点 I03")}><circle r="6"></circle><text x="9" y="13">I03</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I04")}" transform="translate(230 470)" ${assetAttrs("NODE-I04", "孤岛节点 I04")}><circle r="6"></circle><text x="-8" y="-10">I04</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I05")}" transform="translate(315 485)" ${assetAttrs("NODE-I05", "孤岛节点 I05")}><circle r="6"></circle><text x="8" y="-9">I05</text></g>
        <g class="product-junction-node product-island-node${selectedClass("NODE-I06")}" transform="translate(350 520)" ${assetAttrs("NODE-I06", "孤岛节点 I06")}><circle r="6"></circle><text x="9" y="-9">I06</text></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V401")}" transform="translate(682 330)" ${assetAttrs("VALVE-V401", "阀门 V-401")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle></g>
        <g class="product-valve-node${layerHidden("valves")}${selectedClass("VALVE-V402")}" transform="translate(682 462)" ${assetAttrs("VALVE-V402", "阀门 V-402")}><path d="M-11 0 0-11 11 0 0 11Z"></path><circle r="3"></circle></g>
        <g class="product-user-terminal${layerHidden("users")}${selectedClass("USER-NORTH")}" transform="translate(810 92)" ${assetAttrs("USER-NORTH", "北区用户")}><path class="product-user-house" d="M-18 2 0-12 18 2v22h-36Z"></path><text x="0" y="40">北区用户</text></g>
        <g class="product-user-terminal${layerHidden("users")}${selectedClass("USER-NORTHEAST")}" transform="translate(810 230)" ${assetAttrs("USER-NORTHEAST", "东北用户")}><path class="product-user-house" d="M-18 2 0-12 18 2v22h-36Z"></path><text x="0" y="40">东北用户</text></g>
        <g class="product-user-terminal${layerHidden("users")}${selectedClass("USER-SOUTHEAST")}" transform="translate(810 330)" ${assetAttrs("USER-SOUTHEAST", "东南用户")}><path class="product-user-house" d="M-18 2 0-12 18 2v22h-36Z"></path><text x="0" y="40">东南用户</text></g>
        <g class="product-user-terminal${layerHidden("users")}${selectedClass("USER-SOUTH")}" transform="translate(810 478)" ${assetAttrs("USER-SOUTH", "南区用户")}><path class="product-user-house" d="M-18 2 0-12 18 2v22h-36Z"></path><text x="0" y="40">南区用户</text></g>
        ${points ? `<g class="product-monitor-symbol is-flow${layerHidden("flow")}${selectedClass("Q-001")}" transform="translate(244 274)" data-action="select-monitor" data-value="Q-001" tabindex="0" role="button" aria-label="流量监测点 Q-001，挂接在泵站出水主干管"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">Q</text><text class="product-monitor-value" x="0" y="-24">Q-001 · 1,286 m³/h</text></g>
        <g class="product-monitor-symbol is-flow${layerHidden("flow")}${selectedClass("Q-018")}" transform="translate(474 170)" data-action="select-monitor" data-value="Q-018" tabindex="0" role="button" aria-label="流量监测点 Q-018，挂接在北部主干管"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">Q</text><text class="product-monitor-value" x="0" y="-24">Q-018 · 286 m³/h</text></g>
        <g class="product-monitor-symbol is-flow${layerHidden("flow")}${selectedClass("Q-032")}" transform="translate(474 382)" data-action="select-monitor" data-value="Q-032" tabindex="0" role="button" aria-label="流量监测点 Q-032，挂接在南部主干管"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">Q</text><text class="product-monitor-value" x="0" y="28">Q-032 · 328 m³/h</text></g>
        <g class="product-monitor-symbol is-pressure${layerHidden("pressure")}${selectedClass("P-018")}" transform="translate(544 170)" data-action="select-monitor" data-value="P-018" tabindex="0" role="button" aria-label="压力监测点 P-018，挂接在连接节点 J-02"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">P</text><text class="product-monitor-value" x="18" y="4">P-018 · 0.328 MPa</text></g>
        <g class="product-monitor-symbol is-pressure${layerHidden("pressure")}${selectedClass("P-086")}" transform="translate(682 330)" data-action="select-monitor" data-value="P-086" tabindex="0" role="button" aria-label="压力监测点 P-086，挂接在阀门节点 V-401"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">P</text><text class="product-monitor-value" x="18" y="4">P-086 · 0.246 MPa</text></g>
        <g class="product-monitor-symbol is-pressure is-error${layerHidden("pressure")}${selectedClass("P-032")}" transform="translate(682 462)" data-action="select-worst" data-value="P-032" tabindex="0" role="button" aria-label="压力监测点 P-032，挂接在阀门节点 V-402，低压报警"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">P</text><text class="product-monitor-value" x="18" y="4">P-032 · 0.182 MPa</text></g>
        ${options.quality ? `<g class="product-monitor-symbol is-quality${layerHidden("quality")}" transform="translate(116 246)" data-action="select-monitor" data-value="WQ-001" tabindex="0" role="button" aria-label="水质监测点 WQ-001，第一水厂出厂口"><circle r="16"></circle><text class="product-monitor-code is-wide" x="0" y="4">WQ</text><text class="product-monitor-value" x="18" y="-10">WQ-001 · 0.18 NTU</text></g><g class="product-monitor-symbol is-quality${layerHidden("quality")}" transform="translate(810 250)" data-action="select-monitor" data-value="WQ-018" tabindex="0" role="button" aria-label="水质监测点 WQ-018，东北用户侧"><circle r="16"></circle><text class="product-monitor-code is-wide" x="0" y="4">WQ</text><text class="product-monitor-value" x="-18" y="-10" text-anchor="end">WQ-018 · 0.31 mg/L</text></g><g class="product-monitor-symbol is-quality is-warning${layerHidden("quality")}" transform="translate(810 498)" data-action="select-monitor" data-value="WQ-032" tabindex="0" role="button" aria-label="水质监测点 WQ-032，南区用户侧"><circle r="16"></circle><text class="product-monitor-code is-wide" x="0" y="4">WQ</text><text class="product-monitor-value" x="-18" y="-10" text-anchor="end">WQ-032 · 0.16 mg/L</text></g>` : ""}
        ${options.level ? `<g class="product-monitor-symbol is-level${layerHidden("level")}${selectedClass("WL-001")}" transform="translate(76 224)" data-action="select-monitor" data-value="WL-001" tabindex="0" role="button" aria-label="水位监测点 WL-001，第一水厂清水池"><circle r="16"></circle><text class="product-monitor-code is-wide" x="0" y="4">WL</text><text class="product-monitor-value" x="-18" y="-10" text-anchor="end">WL-001 · 4.82 m</text></g>` : ""}` : ""}
        ${options.operations ? `<g class="product-ops-marker is-alarm${layerHidden("alarms")}" transform="translate(720 438)" data-action="select-map-alarm" data-value="ALM-032" tabindex="0" role="button" aria-label="报警 ALM-032 城南低压"><path d="M0-18 18 14H-18Z"></path><text x="0" y="8">!</text><text class="product-ops-label" x="22" y="4">ALM-032 · 低压</text></g><g class="product-ops-marker is-alarm${layerHidden("alarms")}" transform="translate(730 198)" data-action="select-map-alarm" data-value="ALM-018" tabindex="0" role="button" aria-label="报警 ALM-018 数据延迟"><path d="M0-18 18 14H-18Z"></path><text x="0" y="8">!</text><text class="product-ops-label" x="22" y="4">ALM-018 · 延迟</text></g><g class="product-ops-marker is-workorder${layerHidden("workorders")}" transform="translate(396 418)" data-action="select-workorder" data-value="WO-2026-083" tabindex="0" role="button" aria-label="工单 WO-2026-083 南干线阀门巡检"><rect x="-16" y="-16" width="32" height="32" rx="6"></rect><text x="0" y="6">单</text><text class="product-ops-label" x="22" y="4">WO-083 · 待派单</text></g><g class="product-ops-marker is-workorder${layerHidden("workorders")}" transform="translate(186 318)" data-action="select-workorder" data-value="WO-2026-079" tabindex="0" role="button" aria-label="工单 WO-2026-079 泵站月度保养"><rect x="-16" y="-16" width="32" height="32" rx="6"></rect><text x="0" y="6">单</text><text class="product-ops-label" x="22" y="4">WO-079 · 处理中</text></g>` : ""}
        ${options.virtual ? '<g class="product-monitor-symbol is-virtual" transform="translate(612 356)" data-action="select-virtual" tabindex="0" role="button" aria-label="虚拟流量计 VFM-006"><circle r="15"></circle><text class="product-monitor-code" x="0" y="5">V</text><text class="product-monitor-value" x="18" y="4">VFM-006</text></g>' : ""}
      </svg>
      <div class="product-topology-legend">${points ? '<span><i class="product-legend-monitor">P</i>压力 · 节点</span><span><i class="product-legend-monitor">Q</i>流量 · 管段</span>' : ''}${options.quality ? '<span><i class="product-legend-monitor is-quality">WQ</i>水质 · 水厂/用户</span>' : ''}${options.level ? '<span><i class="product-legend-monitor is-level">WL</i>水位 · 水厂</span>' : ''}${options.operations ? '<span><i class="product-legend-alert">!</i>报警</span><span><i class="product-legend-order">单</i>工单</span>' : ''}${options.assetView ? '<span><i class="product-legend-valve">◇</i>阀门</span><span><i class="product-legend-pump">○</i>泵站</span>' : ''}</div>
    </div>`;
  }

  function isSchoolAccount(){return window.SchoolAccess.isSchool(state.account);}
  function applySchoolScope(){
    const school=isSchoolAccount(),brand=document.querySelector('.product-brand-button');
    brand.dataset.page=school?'p02dma':'p02';brand.setAttribute('aria-label',school?'返回 DMA 分区计量一张图':'返回运维一张图');
    document.querySelector('[data-action="open-projects"]').hidden=school;
    document.getElementById('projectSelect').disabled=school;
    messageCenterButton.hidden=school;
    if(school){
      state.messageCenterOpen=false;messageCenterRoot.innerHTML='';
      workspace.querySelectorAll('[data-page]').forEach(el=>{if(!window.SchoolAccess.canPage(el.dataset.page))el.remove();});
      workspace.querySelectorAll('[data-action]').forEach(el=>{if(!window.SchoolAccess.canAction(el.dataset.action))el.remove();});
    }
  }
  function renderLogin() {
    return `<div class="product-login-page"><section class="product-login-brand" aria-label="系统介绍"><div class="product-login-brand-inner"><div class="product-login-logo"><span class="app-brand-mark">水</span><span>城市供水管网</span></div><h1>GIS + SCADA 运行管理平台</h1><p>统一管理多城市供水项目，进入项目后开展管网运行、拓扑、DMA 与实时监测工作。</p><div class="product-login-capabilities"><span>多城市项目统一入口</span><span>项目级数据隔离</span><span>GIS 与 SCADA 联动</span></div></div></section><section class="product-login-panel"><form class="product-login-card" data-action="login-submit"><div><h2>登录系统</h2><p>请输入账号进入项目管理。admin 可查看全部功能；1.0 演示账号：viewer1，密码：Viewer@2026。学校专供账号：school1，密码：School@2026。</p></div><label class="app-form-item"><span class="app-form-label is-required">账号</span><input id="loginAccount" class="app-input" placeholder="请输入账号" autocomplete="username" /></label><label class="app-form-item"><span class="app-form-label is-required">密码</span><input id="loginPassword" class="app-input" type="password" placeholder="请输入密码" autocomplete="current-password" /></label><div id="loginError" class="app-form-error product-login-error" role="alert"></div><button class="app-button app-button-primary app-button-large product-login-submit" type="submit">登录</button></form></section></div>`;
  }

  function renderProjects() {
    const keyword = state.projectQuery.trim().toLowerCase();
    const projects = state.projects.filter(project => !keyword || [project.name, project.province, project.city, project.district, project.owner, project.id].some(value => String(value).toLowerCase().includes(keyword)));
    const running = state.projects.filter(project => project.status === "运行中").length;
    const building = state.projects.filter(project => project.status === "建设中").length;
    return `<div class="product-project-page"><header class="product-entry-header"><div class="product-entry-brand"><span class="app-brand-mark">水</span><div><strong>城市供水管网</strong><small>GIS + SCADA</small></div></div><div class="product-entry-user"><span class="app-tag app-tag-blue">${state.productVersion===2?"全部功能":"产品 1.0"}</span><span class="product-avatar">${state.productVersion===2?"管":"1"}</span><span>${state.productVersion===2?"admin":"1.0 演示账号"}</span><button class="app-button theme-toggle" type="button" data-theme-toggle aria-label="切换到暗色">☾ 暗色</button><button class="app-button" type="button" data-action="logout">退出登录</button></div></header><main class="product-project-main"><div class="app-breadcrumb"><span>平台管理</span><span class="app-breadcrumb-separator">/</span><span class="app-breadcrumb-current">城市项目</span></div><section class="app-page-header"><div class="app-page-header-main"><h1 class="app-page-title">城市项目</h1><p class="app-page-header-description">选择项目进入业务系统；管理员可维护项目基础信息。</p></div><div class="app-page-header-actions"><button class="app-button app-button-primary" type="button" data-action="create-project">新建项目</button></div></section><section class="product-project-stats"><div class="app-card app-card-body"><div class="app-statistic-label">项目总数</div><div class="app-statistic-value">${state.projects.length}</div><div class="app-statistic-meta">覆盖 ${new Set(state.projects.map(project => project.city)).size} 个城市</div></div><div class="app-card app-card-body"><div class="app-statistic-label">运行中</div><div class="app-statistic-value">${running}</div><div class="app-statistic-meta">项目数据正常接入</div></div><div class="app-card app-card-body"><div class="app-statistic-label">建设中</div><div class="app-statistic-value">${building}</div><div class="app-statistic-meta">正在配置管网数据</div></div></section><section class="app-search-panel"><div class="product-project-search"><label class="app-form-item"><span class="app-form-label">项目名称 / 省市区 / 负责人</span><input id="projectSearchInput" class="app-input" value="${escapeHtml(state.projectQuery)}" placeholder="请输入关键词" /></label><div class="app-search-actions"><button class="app-button app-button-primary" type="button" data-action="project-search">查询</button><button class="app-button" type="button" data-action="project-reset">重置</button></div></div></section><div class="app-toolbar"><div class="app-toolbar-left"><span class="app-result-count">共 <strong>${projects.length}</strong> 个项目</span></div></div>${projects.length ? `<div class="app-table-wrap"><table class="app-table product-project-table"><thead><tr><th>项目名称</th><th>省 / 市 / 区</th><th>状态</th><th>负责人</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${projects.map(project => `<tr><td><strong>${escapeHtml(project.name)}</strong><div class="app-text-tertiary">${project.id}</div></td><td>${escapeHtml(project.province)} / ${escapeHtml(project.city)}<div class="app-text-tertiary">${escapeHtml(project.district)}</div></td><td>${tag(project.status, project.status === "运行中" ? "success" : project.status === "建设中" ? "warning" : "")}</td><td>${escapeHtml(project.owner)}</td><td>${project.updated}</td><td><div class="app-table-actions"><button class="app-button app-button-link" type="button" data-action="enter-project" data-project-id="${project.id}">进入项目</button><button class="app-button app-button-link" type="button" data-action="edit-project" data-project-id="${project.id}">编辑</button><button class="app-button app-button-link product-project-delete" type="button" data-action="delete-project" data-project-id="${project.id}">删除</button></div></td></tr>`).join("")}</tbody></table></div>` : `<section class="app-card"><div class="app-empty"><div><div class="app-empty-mark"></div><div>未找到匹配项目</div><button class="app-button app-button-primary u-mt-3" type="button" data-action="project-reset">清除筛选</button></div></div></section>`}</main></div>`;
  }

  function renderProjectOptions() {
    const select = document.getElementById("projectSelect");
    select.innerHTML = state.projects.filter(project => project.status !== "已停用" && (!isSchoolAccount() || project.id===window.SchoolAccess.projectId)).map(project => `<option value="${project.id}" ${project.id === state.activeProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
  }

  function renderNav() {
    const visibleGroups=isSchoolAccount()?window.SchoolAccess.navigation(navGroups):navGroups.filter(g=>g.version!=="2.0"||state.productVersion===2).map(g=>({...g,items:g.items.filter(i=>!i.v2||state.productVersion===2)}));
    const pageMatches = (item, page) => item.page === page || isSchoolAccount()&&item.page==="p10"&&window.SchoolAccess.detailPages.includes(page) || item.page === "p08" && page === "p06compare" || item.page === "p02" && page === "p01";
    const activeGroup = visibleGroups.find(group => group.items.some(item => pageMatches(item, state.page)));
    if (!state.navDrawerOpen && activeGroup) state.navGroup = activeGroup.id;
    const drawerGroup = visibleGroups.find(group => group.id === state.navGroup) || activeGroup || visibleGroups[0];
    document.getElementById("sideNav").innerHTML = visibleGroups.map(group => `<button class="product-primary-nav-item ${activeGroup && activeGroup.id === group.id ? "is-active" : ""} ${state.navDrawerOpen && drawerGroup.id === group.id ? "is-open" : ""}" type="button" data-action="toggle-primary-nav" data-value="${group.id}" aria-expanded="${state.navDrawerOpen && drawerGroup.id === group.id}">${navIcon(group.icon)}<span>${group.title}</span>${group.version ? `<em>${group.version}</em>` : ""}</button>`).join("");
    const drawer = document.getElementById("navDrawer");
    drawer.className = `product-nav-drawer ${state.navDrawerOpen ? "is-open" : ""}`;
    drawer.setAttribute("aria-hidden", String(!state.navDrawerOpen));
    drawer.innerHTML = `<header class="product-nav-drawer-header"><div><strong>${drawerGroup.title}</strong>${drawerGroup.version ? `<span>${drawerGroup.version}</span>` : ""}</div><button type="button" data-action="close-nav-drawer" aria-label="关闭二级菜单">×</button></header><nav class="product-secondary-nav">${drawerGroup.items.map(item => item.future ? `<button class="product-secondary-nav-item is-future" type="button" disabled>${navIcon(item.icon)}<span>${item.label}</span><em>${drawerGroup.version}</em></button>` : `<button class="product-secondary-nav-item ${pageMatches(item, state.page) ? "is-active" : ""}" type="button" data-page="${item.page}">${navIcon(item.page)}<span>${item.label}</span></button>`).join("")}</nav>`;
  }

  function renderP01() { return renderP02("operations");
  }

  function p02DrawerTabs() {
    const drawerType = typeof state.p02Drawer === "string" ? state.p02Drawer.split(":")[0] : "";
    const labels = drawerType === "dma" ? ["分区概览", "计量明细", "异常记录"] : ["asset", "pipe", "node"].includes(drawerType) ? ["基础信息", "状态信息", "巡检记录"] : ["基础信息", "监测指标", "运行事件"];
    if (state.p02DrawerTab === "topology") state.p02DrawerTab = "basic";
    const tabs = [["basic", labels[0]], ["metrics", labels[1]], ...(!isSchoolAccount()?[["history", labels[2]]]:[])];
    const selectedUser=topologyReadModel?.objects.get(String(state.p02Drawer).split(":").slice(1).join(":"));
    if(selectedUser?.type==="user"&&String(selectedUser.user_subtype||selectedUser.userSubtype||'').toUpperCase()!=='FIRE_HYDRANT')tabs.push(["floors","子用户与设备"]);
    return `<div class="app-tabs product-drawer-tabs">${tabs.map(tabItem => `<button class="app-tab ${state.p02DrawerTab === tabItem[0] ? "is-active" : ""}" type="button" data-action="p02-drawer-tab" data-value="${tabItem[0]}">${tabItem[1]}</button>`).join("")}</div>`;
  }

  function p02DmaDrawerContent(dma) {
    if (!dma) return '<div class="app-empty">所选拓扑中无此分区</div>';
    if (state.p02DrawerTab === 'history') return '<div class="app-empty">暂无已归档分区运行记录</div>';
    const b = dma.balance || {}, info = dma.deviceSummary || dmaDeviceSummary(dma), readonly = !dmaMetadataEditable();
    const fields = window.TopologyMapData.fields;
    const month = b.date || dmaSelectedMonth();
    const pressureTime = info.pressureTime || '暂无有效压力采样';
    const metrics = `<div class="product-dma-kpis"><div class="product-drawer-kpi"><div class="app-statistic-label">分区用水量</div><div class="app-statistic-value">${dmaQuantity(b.usage)}</div><small>${escapeHtml(b.usageStatus || '待接入边界计量')}</small></div><div class="product-drawer-kpi"><div class="app-statistic-label">平均压力</div><div class="app-statistic-value">${dmaQuantity(info.pressure, 'MPa')}</div><div class="app-statistic-meta">有效压力设备 ${info.pressureCount} / ${info.pressureTotal} 台</div><small>${escapeHtml(pressureTime)}</small></div><div class="product-drawer-kpi"><div class="app-statistic-label">分区营收水量</div><div class="app-statistic-value">${dmaQuantity(b.revenue)}</div><small>${escapeHtml(b.revenueStatus || '待接入用户抄表')}</small></div></div>`;
    const links = `<button class="app-button app-button-primary u-w-full" data-action="dma-leakage-trend" data-metric="comparison" data-value="${escapeHtml(dma.id)}">查看 DMA 漏损分析</button><button class="app-button u-w-full" data-action="dma-leakage-trend" data-metric="hourly" data-value="${escapeHtml(dma.id)}">查看分区每小时用水量</button>`;
    if (state.p02DrawerTab === 'metrics') return fields([
      ['进口水量', dmaQuantity(b.inlet)], ['出口水量', dmaQuantity(b.outlet)],
      ['月度水量差值', dmaQuantity(b.difference)], ['有效统计日数', `${b.days || 0} / ${b.totalDays || window.DMAStatistics.days(month)} 天`]
    ]) + links;
    const nameEditor = `<div class="dma-name-editor"><label class="app-form-item"><span class="app-form-label">分区名称</span><input id="dmaZoneName" class="app-input" maxlength="60" value="${escapeHtml(dma.name)}" ${readonly ? 'readonly' : ''}></label>${readonly ? '' : `<button class="app-button" data-action="save-dma-metadata" data-value="${escapeHtml(dma.id)}">保存名称</button>`}</div>`;
    return nameEditor + metrics + fields([['分区 ID（系统设置）', dma.id], ['分区内设备数量', info.count + ' 台'], ['分区层级', dma.level + ' 级'], ['上级分区', findDma(dma.parent)?.name || '项目供水范围']])
      + (dmaDemoEnabled() ? '<p class="app-text-tertiary">演示数据</p>' : '')
      + fields([['成员点 / 管线', `${dma.nodeIds?.length || 0} / ${dma.pipeIds?.length || 0}`], ['边界管线', dma.boundaries?.length || 0]])
      + links;
  }

  function p02ObjectDrawerContent(type, id) {
    if(topologyReadModel && ['alarm','workorder'].includes(type)) return operations().mapDetail(type==='alarm'?'alarm':'work',id);
    if (type === "dma") return p02DmaDrawerContent(findDma(id));
    if(topologyReadModel)return window.TopologyMapData.detail(topologyReadModel,type,id,state.p02DrawerTab);
    if (type === "alarm") {
      if (state.p02DrawerTab === "metrics") return `<div class="product-drawer-kpi is-warning"><div class="app-statistic-label">关联压力点 P-032</div><div class="app-statistic-value">0.182 MPa</div><div class="app-statistic-meta">阈值 0.200 MPa · 已持续 28 分钟</div></div>${p02MetricTrend("报警前后压力", "MPa", [{ name: "监测压力", data: [0.238, 0.234, 0.232, 0.226, 0.220, 0.206, 0.194, 0.190, 0.186, 0.182, 0.182] }, { name: "低压阈值", data: p02TrendTimes.map(() => 0.200), dashed: true, symbol: "none" }], "is-warning", "压力")}`;
      if (state.p02DrawerTab === "topology") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="select-monitor" data-value="P-032"><span><strong>P-032 城南末梢压力点</strong><small>VALVE V-402 · DMA-城南-03</small></span><span class="app-button app-button-link">定位</span></button><button class="product-detail-list-row" type="button" data-action="upstream"><span><strong>影响范围</strong><small>4 条下游管线 · 1,260 户</small></span><span class="app-button app-button-link">查看</span></button></div>`;
      if (state.p02DrawerTab === "history") return `<div class="product-event-list"><div class="product-event-row"><time>14:31</time><span>压力低于 0.20 MPa</span>${tag("触发", "error")}</div><div class="product-event-row"><time>14:36</time><span>通知城南运维班组</span>${tag("已通知", "blue")}</div><div class="product-event-row"><time>14:40</time><span>关联工单 WO-2026-083</span>${tag("待派单", "warning")}</div></div>`;
      return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">报警编号</div><div class="app-description-value">${id}</div></div><div class="app-description-item"><div class="app-description-label">报警类型</div><div class="app-description-value">压力下限</div></div><div class="app-description-item"><div class="app-description-label">当前状态</div><div class="app-description-value">${state.p02AlarmStatus}</div></div><div class="app-description-item"><div class="app-description-label">发生时间</div><div class="app-description-value">14:31:44</div></div><div class="app-description-item"><div class="app-description-label">报警等级</div><div class="app-description-value">严重</div></div><div class="app-description-item"><div class="app-description-label">责任班组</div><div class="app-description-value">城南运维班</div></div></div><div class="u-flex u-gap-2"><button class="app-button app-button-primary" type="button" data-action="ack-map-alarm">确认报警</button><button class="app-button" type="button" data-action="create-map-workorder">生成工单</button></div>`;
    }
    if (type === "workorder") {
      if (state.p02DrawerTab === "metrics") return `<div class="product-mini-stats"><div class="product-mini-stat"><span>计划工时</span><strong>2.0 h</strong></div><div class="product-mini-stat"><span>已用工时</span><strong>0.5 h</strong></div><div class="product-mini-stat"><span>SLA 剩余</span><strong>3.2 h</strong></div><div class="product-mini-stat"><span>关联报警</span><strong>1</strong></div></div>`;
      if (state.p02DrawerTab === "topology") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="select-asset" data-value="VALVE-V301"><span><strong>VALVE-V301 南干线控制阀</strong><small>DN500 蝶阀 · 南部主干管</small></span><span class="app-button app-button-link">资产详情</span></button><button class="product-detail-list-row" type="button" data-action="select-monitor" data-value="P-032"><span><strong>P-032 压力点</strong><small>0.182 MPa · 低压</small></span><span class="app-button app-button-link">监测详情</span></button></div>`;
      if (state.p02DrawerTab === "history") return `<div class="product-event-list"><div class="product-event-row"><time>14:40</time><span>工单创建</span>${tag("待派单", "warning")}</div><div class="product-event-row"><time>14:42</time><span>推荐城南运维班组</span>${tag("系统")}</div></div>`;
      return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">工单编号</div><div class="app-description-value">${id}</div></div><div class="app-description-item"><div class="app-description-label">工单类型</div><div class="app-description-value">阀门巡检</div></div><div class="app-description-item"><div class="app-description-label">当前状态</div><div class="app-description-value">${state.p02WorkorderStatus}</div></div><div class="app-description-item"><div class="app-description-label">优先级</div><div class="app-description-value">紧急</div></div><div class="app-description-item"><div class="app-description-label">责任班组</div><div class="app-description-value">城南运维班</div></div><div class="app-description-item"><div class="app-description-label">要求完成</div><div class="app-description-value">今天 18:00</div></div></div><button class="app-button app-button-primary" type="button" data-action="process-map-workorder">${state.p02WorkorderStatus === "处理中" ? "更新处理进度" : "派单并开始处理"}</button>`;
    }
    if (type === "asset") {
      const asset = p02AssetCatalog.find(item => item.id === id) || p02AssetCatalog[0];
      if (state.p02DrawerTab === "metrics") return `<div class="product-mini-stats"><div class="product-mini-stat"><span>健康评分</span><strong>92</strong></div><div class="product-mini-stat"><span>服役年限</span><strong>8.4 年</strong></div><div class="product-mini-stat"><span>本年巡检</span><strong>11 次</strong></div><div class="product-mini-stat"><span>缺陷记录</span><strong>1</strong></div></div>`;
      if (state.p02DrawerTab === "topology") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="select-pipe" data-pipe-id="PIPE-2026-010"><span><strong>上游 PIPE-2026-010</strong><small>DN500 · 球墨铸铁</small></span><span class="app-button app-button-link">查看</span></button><button class="product-detail-list-row" type="button" data-action="select-pipe" data-pipe-id="PIPE-2026-013"><span><strong>下游 PIPE-2026-013</strong><small>DN300 · PE</small></span><span class="app-button app-button-link">查看</span></button></div>`;
      if (state.p02DrawerTab === "history") return `<div class="product-event-list"><div class="product-event-row"><time>08-28</time><span>季度巡检完成</span>${tag("正常", "success")}</div><div class="product-event-row"><time>06-12</time><span>启闭测试完成</span>${tag("正常", "success")}</div><div class="product-event-row"><time>03-05</time><span>更换密封组件</span>${tag("维修")}</div></div>`;
      return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">资产编号</div><div class="app-description-value">${asset.id}</div></div><div class="app-description-item"><div class="app-description-label">资产类型</div><div class="app-description-value">${asset.type}</div></div><div class="app-description-item"><div class="app-description-label">资产名称</div><div class="app-description-value">${asset.name}</div></div><div class="app-description-item"><div class="app-description-label">规格参数</div><div class="app-description-value">${asset.model}</div></div><div class="app-description-item"><div class="app-description-label">所在位置</div><div class="app-description-value">${asset.location}</div></div><div class="app-description-item"><div class="app-description-label">运行状态</div><div class="app-description-value">${asset.status}</div></div></div>`;
    }
    if (type === "monitor") {
      const monitor = p02MonitorCatalog.find(item => item.id === id) || p02MonitorCatalog[0];
      if (state.p02DrawerTab === "topology") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="select-dma" data-value="${monitor.id === "P-032" || monitor.id === "Q-032" || monitor.id === "WQ-032" ? "DMA-城南-03" : "DMA-城北-01"}"><span><strong>所属 DMA</strong><small>${monitor.location}</small></span><span class="app-button app-button-link">定位</span></button><button class="product-detail-list-row" type="button" data-action="upstream"><span><strong>上下游关联对象</strong><small>2 条上游管线 · 4 条下游管线</small></span><span class="app-button app-button-link">查看</span></button></div>`;
      if (state.p02DrawerTab === "history") return `<div class="product-event-list"><div class="product-event-row"><time>14:32</time><span>实时值 ${monitor.value}</span>${tag(monitor.quality, monitor.quality === "GOOD" ? "success" : "warning")}</div><div class="product-event-row"><time>13:45</time><span>数据采集完成</span>${tag("GOOD", "success")}</div><div class="product-event-row"><time>09:18</time><span>设备自检通过</span>${tag("正常")}</div></div>`;
      if (state.p02DrawerTab === "metrics") {
        const unit = monitor.type === "pressure" ? "MPa" : monitor.type === "flow" ? "m³/h" : monitor.type === "level" ? "m" : monitor.value.includes("NTU") ? "NTU" : "mg/L";
        const metricName = { pressure: "压力", flow: "流量", level: "水位", quality: "水质" }[monitor.type];
        const values = monitor.type === "pressure" ? [0.218, 0.226, 0.222, 0.234, 0.230, 0.238, 0.225, 0.229, 0.220, 0.232, 0.228] : monitor.type === "flow" ? [1188, 1216, 1202, 1244, 1230, 1258, 1212, 1228, 1198, 1236, 1220] : monitor.type === "level" ? [4.76, 4.80, 4.78, 4.84, 4.82, 4.86, 4.81, 4.83, 4.79, 4.85, 4.82] : unit === "NTU" ? [0.16, 0.17, 0.18, 0.17, 0.19, 0.18, 0.17, 0.18, 0.19, 0.18, 0.18] : [0.29, 0.30, 0.31, 0.30, 0.32, 0.31, 0.30, 0.31, 0.32, 0.31, 0.31];
        return `<div class="product-drawer-kpi ${monitor.alarm ? "is-warning" : ""}"><div class="app-statistic-label">当前监测值</div><div class="app-statistic-value">${monitor.value}</div><div class="app-statistic-meta">数据时间 14:32:18 · ${monitor.quality}</div></div>${p02MetricTrend(`${monitor.name}趋势`, unit, values, monitor.alarm ? "is-warning" : "", metricName)}`;
      }
      return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">监测点</div><div class="app-description-value">${monitor.id}</div></div><div class="app-description-item"><div class="app-description-label">类型</div><div class="app-description-value">${{ flow: "流量", pressure: "压力", quality: "水质", level: "水位", noise:"噪声" }[monitor.type]}</div></div><div class="app-description-item"><div class="app-description-label">挂接位置</div><div class="app-description-value">${monitor.location}</div></div><div class="app-description-item"><div class="app-description-label">质量码</div><div class="app-description-value">${monitor.quality}</div></div><div class="app-description-item"><div class="app-description-label">采集周期</div><div class="app-description-value">5 分钟</div></div><div class="app-description-item"><div class="app-description-label">当前值</div><div class="app-description-value">${monitor.value}</div></div></div>`;
    }
    if (type === "node") return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">节点</div><div class="app-description-value">${id}</div></div><div class="app-description-item"><div class="app-description-label">节点类型</div><div class="app-description-value">连接点</div></div><div class="app-description-item"><div class="app-description-label">连接管线</div><div class="app-description-value">3 条</div></div><div class="app-description-item"><div class="app-description-label">所属 DMA</div><div class="app-description-value">DMA-城南-03</div></div></div>`;
    const pipe = p02PipeCatalog.find(item => item.id === id) || p02PipeCatalog[2];
    if (state.p02DrawerTab === "topology") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="locate-node" data-value="J-03"><span><strong>起点 J-03</strong><small>连接度 3 · 正常</small></span><span class="app-button app-button-link">定位</span></button><button class="product-detail-list-row" type="button" data-action="locate-node" data-value="J-04"><span><strong>终点 J-04</strong><small>连接度 4 · 正常</small></span><span class="app-button app-button-link">定位</span></button></div>`;
    if (state.p02DrawerTab === "metrics") return `<div class="product-detail-list"><button class="product-detail-list-row" type="button" data-action="select-monitor" data-value="Q-032"><span><strong>Q-032 管段流量</strong><small>328 m³/h · GOOD</small></span>${tag("在线", "success")}</button><button class="product-detail-list-row" type="button" data-action="select-monitor" data-value="P-032"><span><strong>P-032 下游压力</strong><small>0.182 MPa · 低压</small></span>${tag("报警", "error")}</button></div>`;
    if (state.p02DrawerTab === "history") return `<div class="product-event-list"><div class="product-event-row"><time>14:18</time><span>下游压力低于阈值</span>${tag("低压", "error")}</div><div class="product-event-row"><time>08:30</time><span>日常巡检完成</span>${tag("正常", "success")}</div></div>`;
    return `<div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">Pipe ID</div><div class="app-description-value">${pipe.id}</div></div><div class="app-description-item"><div class="app-description-label">名称</div><div class="app-description-value">${pipe.name}</div></div><div class="app-description-item"><div class="app-description-label">管径 / 材质</div><div class="app-description-value">${pipe.diameter} / ${pipe.material}</div></div><div class="app-description-item"><div class="app-description-label">长度</div><div class="app-description-value">328.4 m</div></div><div class="app-description-item"><div class="app-description-label">起点 Node</div><div class="app-description-value"><button class="app-button app-button-link" type="button" data-action="locate-node" data-value="J-03">J-03</button></div></div><div class="app-description-item"><div class="app-description-label">终点 Node</div><div class="app-description-value"><button class="app-button app-button-link" type="button" data-action="locate-node" data-value="J-04">J-04</button></div></div></div>`;
  }

  function p02Drawer() {
    if (!state.p02Drawer) return "";
    const drawerValue = state.p02Drawer === "worst" ? "monitor:P-032" : state.p02Drawer === "pipe" ? "pipe:PIPE-2026-003" : state.p02Drawer;
    const separator = drawerValue.indexOf(":");
    const type = drawerValue.slice(0, separator);
    const id = drawerValue.slice(separator + 1);
    if(['alarm','workorder'].includes(type)) {
      const db=operations().load(),record=(type==='alarm'?db.alarms:db.orders).find(r=>r.id===id);
      return `<div class="app-gis-panel-header"><strong>${escapeHtml(record?.name||id)}</strong><button class="app-button" data-action="close-drawer">关闭</button></div><div class="app-gis-panel-body">${operations().mapDetail(type==='alarm'?'alarm':'work',id)}</div>`;
    }
    const dma = type === "dma" ? findDma(id) : null;
    const monitor = type === "monitor" ? p02MonitorCatalog.find(item => item.id === id) : null;
    const pipe = type === "pipe" ? p02PipeCatalog.find(item => item.id === id) : null;
    const asset = type === "asset" ? p02AssetCatalog.find(item => item.id === id) : null;
    const title = dma ? `${escapeHtml(dma.id)} ${escapeHtml(dma.name)}` : monitor ? `${monitor.id} ${monitor.name}` : asset ? `${asset.id} ${asset.name}` : type === "alarm" ? `${id} 城南低压报警` : type === "workorder" ? `${id} 南干线阀门巡检` : type === "node" ? `${id} 连接节点` : `${id} ${(pipe || p02PipeCatalog[2]).name}`;
    const subtitle = dma ? `${dma.level}级分区 · ${dma.status}` : monitor ? `${{ flow: "流量监测", pressure: "压力监测", quality: "水质监测", level: "水位监测", noise: "噪声监测" }[monitor.type]} · 在线` : asset ? `${asset.type} · ${asset.status}` : type === "alarm" ? `报警 · ${state.p02AlarmStatus}` : type === "workorder" ? `工单 · ${state.p02WorkorderStatus}` : type === "node" ? "Node · 使用中" : "Pipe · 使用中";
    const needsAttention = dma && dma.status !== "正常" || monitor && monitor.alarm || type === "alarm" || type === "workorder" && state.p02WorkorderStatus !== "已完成" || asset && asset.status === "待巡检";
    return `<div class="app-gis-panel-header"><div><strong>${title}</strong><div class="app-text-tertiary">${subtitle}</div></div><button class="app-button app-button-text app-button-icon" type="button" data-action="close-drawer" aria-label="关闭">×</button></div><div class="app-gis-panel-body product-detail-stack"><div class="u-flex u-justify-between u-items-center">${type === "dma" ? "" : isCampusProject()&&type!=="monitor"?tag("状态待核实", ""):tag(needsAttention ? "需要关注" : "运行正常", needsAttention ? "warning" : "success")}${type === "monitor" ? '<button class="app-button app-button-link" type="button" data-action="view-trend">查看完整趋势</button>' : ""}</div>${p02DrawerTabs()}${p02ObjectDrawerContent(type, id)}</div>`;
  }

  function p02MapOverlay() {
    if (!state.p02SelectionShape && !state.p02FullExtent) return "";
    if (state.p02FullExtent) return '<div class="product-map-tool-result is-reset"><strong>全图范围</strong><span>已定位当前项目全部管网对象</span></div>';
    const overlays = {
      box: '<div class="product-map-selection-box"><span>框选 12 个对象</span></div>',
      polygon: '<svg class="product-map-selection-polygon" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="18,22 72,14 88,58 56,84 14,68"></polygon></svg><div class="product-map-tool-result"><strong>多边形选择</strong><span>已选中 18 个对象</span></div>',
      distance: '<svg class="product-map-measure" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="24,66 48,40 76,58"></polyline></svg><div class="product-map-tool-result"><strong>测距结果</strong><span>1.26 km</span></div>',
      area: '<svg class="product-map-selection-polygon is-measure" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="28,22 74,30 82,70 46,82 18,58"></polygon></svg><div class="product-map-tool-result"><strong>测面积结果</strong><span>2.84 km²</span></div>'
    };
    return overlays[state.p02SelectionShape] || "";
  }

  function p02ViewConfig(view) {
    if(state.page==="p13")return {title:"当日报警一张图",panel:"报警图层",action:'<button class="app-button" data-page="p13h">查看历史记录</button>'};
    if(state.page==="p15")return {title:"工单一张图",panel:"工单图层",action:'<button class="app-button" data-page="p15h">查看历史记录</button><button class="app-button app-button-primary" data-action="create-map-workorder">新建工单</button>'};
    if (view === "dma") return { title: "DMA 分区计量一张图", panel: "DMA 专题图层", action: `<button class="app-button" type="button" data-action="save-selection" ${state.p02SelectedObjects.length ? "" : "disabled"}>保存选择集</button>` };
    if (view === "assets") return { title: "管网资产一张图", panel: "资产图层", action: '<button class="app-button" type="button" data-action="export-assets">导出台账</button>' };
    return { title: "运维一张图", panel: "运维图层", action: '<button class="app-button" type="button" data-page="p01">进入运维数据总览</button><button class="app-button app-button-primary" type="button" data-action="create-map-workorder">新建工单</button>' };
  }

  function mapToolIcon(type) {
    const icons = {
      select: '<path d="M5 3.5 18.5 10 12 12.2 9.8 18.5Z"></path><path d="m12 12 5 5"></path>',
      multi: '<rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect><path d="m14.5 7.5 1.6 1.6 3.4-3.6"></path>',
      box: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"></rect><path d="M8 2v4M2 8h4M18 22v-4M22 18h-4"></path>',
      polygon: '<path d="m5 6 7-3 7 5-2 10-10 2Z"></path><circle cx="5" cy="6" r="1.5"></circle><circle cx="12" cy="3" r="1.5"></circle><circle cx="19" cy="8" r="1.5"></circle><circle cx="17" cy="18" r="1.5"></circle><circle cx="7" cy="20" r="1.5"></circle>',
      distance: '<path d="M4 17 17 4l3 3L7 20Z"></path><path d="m8 14 2 2m1-5 2 2m1-5 2 2"></path>',
      area: '<path d="m4 17 4-11 10-2 3 9-7 8Z"></path><path d="M8 6 21 13M4 17l10 4" stroke-dasharray="2 2"></path>',
      extent: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"></path><path d="m9 4-5 5m11-5 5 5m0 6-5 5M4 15l5 5"></path>',
      clear: '<path d="m4 15 9-10 7 7-8 9H7Z"></path><path d="m10 8 7 7M12 21h9"></path>',
      zoomIn: '<circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5M11 8v6M8 11h6"></path>',
      zoomOut: '<circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5M8 11h6"></path>',
      cluster: '<circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><circle cx="12" cy="16" r="3"></circle><path d="m10 9.5 1 3m3-3-1 3"></path>'
    };
    return `<svg class="product-map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[type]}</svg>`;
  }

  function p02BottomTabConfig(view) {
    if (view === "assets") return [["pipes", "管线"], ["valves", "阀门"], ["nodes", "连接节点"], ["users", "用户端"], ["hydrants", "消火栓"], ["facilities", "水厂与泵站"]];
    if (view === "dma") return [["zones", "分区计量"], ["operations", "月度水量明细"], ["devices", "分区监测设备"]];
    return [["pressure", "压力"], ["flow", "流量"], ["quality", "水质"], ["level", "水位"], ["noise", "噪声仪"], ["events", "报警与工单"]];
  }

  function bottomEmpty() {
    return '<div class="app-empty product-bottom-empty"><div><div class="app-empty-mark"></div><span>未找到匹配对象</span></div></div>';
  }


  function renderBusinessRecords(){
    const work=state.page==="p15";
    let records=work?[
      {id:"WO-2026-083",name:"南干线阀门巡检",object:"VALVE-V301",time:"今日 14:40",status:state.p02WorkorderStatus},
      {id:"WO-2026-079",name:"泵站月度保养",object:"PUMP-001",time:"今日 09:00",status:"处理中"}
    ]:[
      {id:"ALM-032",name:"城南末梢低压",object:"P-032",time:"今日 14:31",status:state.p02AlarmStatus},
      {id:"ALM-018",name:"流量数据延迟",object:"Q-018",time:"今日 14:18",status:"待恢复"}
    ];
    if(topologyReadModel)records=topologyReadModel.events.filter(e=>e.type===(work?'workorder':'alarm')).map((e,i)=>({id:e.id,name:e.name,object:e.hostId||'未挂接',time:i?'今日 09:00':'今日 14:31',status:work?state.p02WorkorderStatus:state.p02AlarmStatus}));
    records=records.filter(r=>Object.values(r).join(" ").includes(state.p02SearchQuery));
    records.sort((a,b)=>state.p02BottomSort==="id"?a.id.localeCompare(b.id):a.status.localeCompare(b.status,"zh-CN"));
    return `<table class="app-table"><thead><tr><th>编号</th><th>${work?"任务":"报警"}</th><th>关联对象</th><th>发生时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${records.map(r=>`<tr><td><strong>${r.id}</strong></td><td>${r.name}</td><td>${r.object}</td><td>${r.time}</td><td>${tag(r.status,"warning")}</td><td><button class="app-button app-button-link" data-action="${work?"select-workorder":"select-map-alarm"}" data-value="${r.id}">地图定位与详情</button></td></tr>`).join("")||'<tr><td colspan="6">暂无匹配记录</td></tr>'}</tbody></table>`;
  }

  function renderP02BottomTable(view, activeTab) {
    if(["p13","p15"].includes(state.page))return renderBusinessRecords();
    const keyword = state.p02SearchQuery.trim().toLowerCase();
    const matches = item => !keyword || Object.values(item).some(value => String(value).toLowerCase().includes(keyword));
    const monitorStatus = item => item.alarm ? "报警" : ({ GOOD: "正常", DELAYED: "延迟", WARNING: "预警", MISSING: "缺测", UNBOUND: "未挂接", PARTIAL: "部分有效" }[item.quality] || "待核实");
    const sortItems = (items, idKey = "id") => [...items].sort((a, b) => state.p02BottomSort === "id" ? String(a[idKey]).localeCompare(String(b[idKey]), "zh-CN") : String(a._status || a.status || "正常").localeCompare(String(b._status || b.status || "正常"), "zh-CN"));
    if (view === "operations") {
      if (activeTab === "events") {
        const events = (topologyReadModel?.events||[]).map(e=>({time:new Date(e.createdAt).toLocaleString('zh-CN'),type:e.type==='alarm'?'报警':'工单',object:escapeHtml(e.hostId),content:escapeHtml(e.name),status:e.status,action:e.type==='alarm'?'select-map-alarm':'select-workorder',id:e.id,tone:e.type==='alarm'?'error':'warning'})).filter(matches);
        if (!events.length) return bottomEmpty();
        return `<table class="app-table"><thead><tr><th>时间</th><th>类型</th><th>对象</th><th>内容</th><th>状态</th></tr></thead><tbody>${events.map(item => `<tr class="product-clickable-row" data-action="${item.action}" data-value="${item.id}" tabindex="0" role="button"><td>${item.time}</td><td>${tag(item.type, item.tone)}</td><td>${item.object}</td><td>${item.content}</td><td>${item.status}</td></tr>`).join("")}</tbody></table>`;
      }
      const monitors = sortItems(p02MonitorCatalog.filter(item => item.type === activeTab && matches(item)).map(item => ({ ...item, _status: monitorStatus(item) })));
      if (!monitors.length) return bottomEmpty();
      return `<table class="app-table"><thead><tr><th>监测点</th><th>名称</th><th>当前值</th><th>质量码</th><th>状态</th></tr></thead><tbody>${monitors.map(item => `<tr class="product-clickable-row" data-action="select-monitor" data-value="${item.id}" tabindex="0" role="button" aria-label="定位监测点 ${item.id}"><td><strong>${item.id}</strong></td><td>${item.name}</td><td>${item.value}</td><td>${item.quality}</td><td>${tag(item._status, item._status === "正常" ? "success" : item._status === "报警" ? "error" : "warning")}</td></tr>`).join("")}</tbody></table>`;
    }
    if (view === "dma") {
      if (activeTab === "devices") {
        const visibleDeviceIds = dmaVisibleDeviceIds();
        const devices = sortItems(p02MonitorCatalog.filter(item => visibleDeviceIds.includes(item.id) && matches(item)).map(item => ({ ...item, _status: monitorStatus(item) })));
        if (!devices.length) return bottomEmpty();
        return `<table class="app-table"><thead><tr><th>设备</th><th>类型</th><th>当前值</th><th>质量码</th><th>状态</th></tr></thead><tbody>${devices.map(item => `<tr class="product-clickable-row" data-action="select-monitor" data-value="${item.id}" tabindex="0" role="button" aria-label="定位监测点 ${item.id}"><td><strong>${item.id}</strong></td><td>${({ flow: "流量监测点", pressure: "压力监测点", quality: "水质监测点", level: "水位监测点", noise: "噪声仪" }[item.type] || item.type)}</td><td>${item.value}</td><td>${item.quality}</td><td>${tag(item._status, item._status === "正常" ? "success" : "warning")}</td></tr>`).join("")}</tbody></table>`;
      }
      const zones = sortItems(dmaChildren().filter(matches));
      if (!zones.length) return bottomEmpty();
      const month = dmaSelectedMonth();
      const heads = activeTab === 'operations'
        ? ['分区', '统计月份', '分区用水量（m³）', '平均压力（MPa）', '营收水量（m³）', '月度差值（m³）', '进口水量（m³）', '出口水量（m³）', '数据状态']
        : ['分区名称 / 系统 ID', '统计月份', '分区用水量（m³）', '平均压力（MPa）', '营收水量（m³）', '设备数量', '层级 / 下级分区', '数据状态'];
      return `<table class="app-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${zones.map(dma => {
        const b = dma.balance || {}, info = dma.deviceSummary || dmaDeviceSummary(dma), children = dmaChildren(dma.id);
        const name = `<td><strong><i style="display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:50%;background:${state.dmaZoneColors[dma.id]}"></i>${escapeHtml(dma.name)}</strong><small class="product-table-subline">${escapeHtml(dma.id)}</small></td>`;
        const core = `<td>${b.date || month}</td><td>${dmaQuantity(b.usage, '')}</td><td>${dmaQuantity(info.pressure, '')}</td><td>${dmaQuantity(b.revenue, '')}</td>`;
        const other = activeTab === 'operations'
          ? `<td>${dmaQuantity(b.difference, '')}</td><td>${dmaQuantity(b.inlet, '')}</td><td>${dmaQuantity(b.outlet, '')}</td>`
          : `<td>${info.count}</td><td>${dma.level} 级 / ${children.length ? children.length + ' 个下级' : '末级'}</td>`;
        return `<tr class="product-clickable-row" data-action="select-dma" data-value="${escapeHtml(dma.id)}" tabindex="0" role="button" aria-label="查看${escapeHtml(dma.name)}分区指标">${name}${core}${other}<td>${escapeHtml(b.usageStatus || '用水量待接入')}<small class="product-table-subline">${escapeHtml(b.revenueStatus || '营收水量待接入')}</small></td></tr>`;
      }).join('')}</tbody></table>`;
    }
    if (activeTab === "pipes") {
      const pipes = sortItems(p02PipeCatalog.filter(matches));
      if (!pipes.length) return bottomEmpty();
      return `<table class="app-table"><thead><tr><th>管线编号</th><th>名称</th><th>管径</th><th>材质</th><th>长度</th><th>状态</th></tr></thead><tbody>${pipes.map(pipe => `<tr class="product-clickable-row" data-action="select-pipe" data-pipe-id="${pipe.id}" tabindex="0" role="button"><td><strong>${pipe.id}</strong></td><td>${pipe.name}</td><td>${pipe.diameter}</td><td>${pipe.material}</td><td>${lengthText(pipe.length)} m</td><td>${tag(topologyReadModel.history?"历史快照":"在用", "success")}</td></tr>`).join("")}</tbody></table>`;
    }
    const acceptedTypes = activeTab === "valves" ? ["阀门"] : activeTab === "nodes" ? ["连接点"] : activeTab === "hydrants" ? ["消火栓"] : activeTab === "users" ? ["用户端"] : ["水厂", "泵站"];
    const assets = sortItems(p02AssetCatalog.filter(item => acceptedTypes.includes(item.type) && matches(item)));
    if (!assets.length) return bottomEmpty();
    return `<table class="app-table"><thead><tr><th>资产编号</th><th>类型</th><th>名称</th><th>规格参数</th><th>所在位置</th><th>状态</th></tr></thead><tbody>${assets.map(asset => `<tr class="product-clickable-row" data-action="select-asset" data-value="${asset.id}" tabindex="0" role="button"><td><strong>${asset.id}</strong></td><td>${asset.type}</td><td>${asset.name}${window.WaterUserHierarchy?.summary(topologyReadModel.data,asset.id)?`<small class="product-table-subline">子用户 ${window.WaterUserHierarchy.summary(topologyReadModel.data,asset.id).children} 个 · 楼栋设备 ${window.WaterUserHierarchy.summary(topologyReadModel.data,asset.id).devices} 台</small>`:""}</td><td>${asset.model}</td><td>${asset.location}</td><td>${tag(asset.status, asset.status === "待巡检" ? "warning" : "success")}</td></tr>`).join("")}</tbody></table>`;
  }

  function renderP02Bottom(view) {
    const activeTab = state.p02BottomTabs[view];
    const tabs = ["p13","p15"].includes(state.page)?[["events",state.page==="p13"?"当日报警":"工单任务"]]:p02BottomTabConfig(view);
    const title = state.page==="p13"?"当日报警":state.page==="p15"?"工单任务":view === "assets" ? "资产对象" : view === "dma" ? "DMA 分区对象" : "运维监测对象";
    const placeholder = view === "assets" ? "查询资产编号、名称或规格" : view === "dma" ? "查询 DMA、设备或状态" : "查询监测点、名称或状态";
    return `<section class="app-gis-bottom product-gis-bottom product-object-drawer ${state.p02BottomOpen ? "" : "is-collapsed"} ${state.p02BottomPageSize === 20 ? "is-page-size-20" : "is-page-size-10"}"><div class="app-gis-bottom-header product-bottom-drawer-header"><div><strong>${title}</strong><span class="app-text-tertiary">查询、筛选与排序</span></div><button class="app-button app-button-text app-button-icon" type="button" data-action="toggle-p02-bottom" aria-label="${state.p02BottomOpen ? "收起对象抽屉" : "展开对象抽屉"}">${state.p02BottomOpen ? "⌄" : "⌃"}</button></div>${state.p02BottomOpen ? `<div class="product-bottom-tabs">${tabs.map(tabItem => `<button class="product-bottom-tab ${activeTab === tabItem[0] ? "is-active" : ""}" type="button" data-action="p02-bottom-tab" data-value="${tabItem[0]}">${tabItem[1]}</button>`).join("")}</div><div class="product-bottom-filterbar"><input id="p02SearchInput" class="app-input" value="${escapeHtml(state.p02SearchQuery)}" placeholder="${placeholder}" /><select class="app-select" data-p02-bottom-sort><option value="status" ${state.p02BottomSort === "status" ? "selected" : ""}>按状态排序</option><option value="id" ${state.p02BottomSort === "id" ? "selected" : ""}>按编号排序</option></select><button class="app-button app-button-primary" type="button" data-action="search-object">查询</button><button class="app-button" type="button" data-action="reset-bottom-query">重置</button></div><div class="app-gis-bottom-body product-bottom-drawer-body">${renderP02BottomTable(view, activeTab)}</div>` : ""}</section>`;
  }

  function mapDateRangeDayCount(range) {
    const start = Date.parse(`${range.appliedStart}T00:00:00`);
    const end = Date.parse(`${range.appliedEnd}T00:00:00`);
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 1;
  }

  function renderMapDateRange(context) {
    const range = state.mapDateRanges[context];
    if (!range) return "";
    return `<div class="product-map-date-range" aria-label="数据日期范围"><strong>数据日期</strong><label><span class="u-sr-only">开始日期</span><input class="app-input" type="date" value="${range.start}" max="2026-09-08" data-map-date data-date-context="${context}" data-date-field="start" aria-label="开始日期" /></label><span>至</span><label><span class="u-sr-only">结束日期</span><input class="app-input" type="date" value="${range.end}" max="2026-09-08" data-map-date data-date-context="${context}" data-date-field="end" aria-label="结束日期" /></label><button class="app-button app-button-small app-button-primary" type="button" data-action="apply-map-date" data-value="${context}">查询</button><em>${mapDateRangeDayCount(range)} 天</em></div>`;
  }

  function renderP02(view = p02ViewFromPage()) {
    const layers = {...state.p02LayersByView[view]};
    if(state.page==="p13"){layers.workorders=false;layers.quality=false;layers.flow=false;layers.level=false;}
    if(state.page==="p15"){layers.alarms=false;layers.quality=false;layers.pressure=false;layers.flow=false;layers.level=false;}
    const config = p02ViewConfig(view);
    const presentation = mapStylePresentation(view, state.p02Zoom, layers);
    const mapClasses = `${layers.basemap ? "" : " is-basemap-hidden"} product-map-view-${view} ${presentation.className}`;
    const viewToolButton = (value, label, icon) => `<button class="app-button app-button-icon product-map-tool-button" type="button" data-action="map-view" data-value="${value}" data-tooltip="${label}" title="${label}" aria-label="${label}">${mapToolIcon(icon)}</button>`;
    const dataScope = view === "operations" ? `${tag("最新监测", "success")}${tag("当日报警与工单", "blue")}` : view === "dma" ? ` ${tag("水量统计 " + dmaSelectedMonth(), "blue")}${tag("压力最新有效采样", "")}` : tag("当前有效资产", "success");
    const mapOptions = { dma: view === "dma", quality: view === "operations" || view === "dma", level: view === "operations", operations: view === "operations", assetView: view === "assets", points: view !== "assets", expanded: true, layers, classificationContext: view === "dma" ? null : view };
    return `<div class="product-page product-page-gis"><div class="product-gis-frame ${state.p02Drawer ? "has-detail" : ""} ${state.p02LayerOpen ? "" : "is-left-collapsed"}"><div class="product-gis-contextbar"><span class="product-gis-title">${config.title}</span><span class="app-text-secondary">${escapeHtml(activeProject().name)}</span><span class="product-current-data-scope">${dataScope}</span><div class="product-gis-contextbar-actions"><button class="app-button" type="button" data-action="global-search">对象列表</button>${config.action}</div></div><div class="product-gis-map${mapClasses}" style="${presentation.style}">${networkMap(mapOptions)}</div>
      ${state.p02LayerOpen ? `<aside class="app-gis-panel product-gis-panel product-gis-panel-left"><div class="app-gis-panel-header"><strong>${config.panel}</strong><button class="app-button app-button-text app-button-icon" type="button" data-action="toggle-layer-drawer" aria-label="收起图层抽屉">‹</button></div><div class="app-gis-panel-body">${renderP02Left(view, layers)}</div></aside>` : `<button class="product-layer-drawer-trigger" type="button" data-action="toggle-layer-drawer" aria-label="展开图层抽屉">图层</button>`}
      <div class="app-gis-toolbar product-gis-toolbar" aria-label="地图查看工具">${viewToolButton("reset", "复位地图", "extent")}${viewToolButton("zoom-in", "放大地图", "zoomIn")}${viewToolButton("zoom-out", "缩小地图", "zoomOut")}<span class="product-map-zoom-label">L${presentation.level} · ${state.p02Zoom}%</span></div>
      ${view === "dma" ? renderDmaMapNavigation() : renderPipeClassificationLegend(view, layers)}
      ${state.layerStyleEditor?.context===view?`<aside class="app-gis-panel product-gis-panel product-gis-panel-right" aria-label="图层样式设置">${renderLayerStyleEditor(view,state.layerStyleEditor.layer)}</aside>`:state.p02Drawer ? `<aside class="app-gis-panel product-gis-panel product-gis-panel-right">${p02Drawer()}</aside>` : ""}${renderP02Bottom(view)}</div></div>`;
  }

  function p02TreeBranch(key, label, children, count) {
    const expanded = state.p02ExpandedTree.includes(key);
    return `<div class="product-tree-branch"><button class="product-tree-row is-group" type="button" data-action="toggle-p02-tree" data-value="${key}" aria-expanded="${expanded}"><span class="product-tree-switch">${expanded ? "⌄" : "›"}</span><span class="product-tree-folder">▣</span><strong>${label}</strong><small>${count}</small></button>${expanded ? `<div class="product-tree-children">${children}</div>` : ""}</div>`;
  }

  function renderP02SelectionTree() {
    if(isCampusProject())return `<div class="product-selection-tree">${p02TreeBranch('dma-root','假定 DMA 分区',p02DmaCatalog.map(dma=>`<button class="product-tree-row is-leaf" type="button" data-action="select-dma" data-value="${escapeHtml(dma.id)}"><span class="product-tree-zone product-zone-${dma.zone}"></span><span><strong>${escapeHtml(dma.name)}</strong><small>${escapeHtml(dma.id)}</small></span></button>`).join(''),p02DmaCatalog.length)}</div>`;
    const dmaGroups = [["dma-north", "城北供水区"], ["dma-south", "城南供水区"], ["dma-east", "城东供水区"], ["dma-west", "城西供水区"]];
    const groupHtml = dmaGroups.map(group => {
      const items = p02DmaCatalog.filter(item => item.group === group[0]).map(dma => `<button class="product-tree-row is-leaf ${state.p02Drawer === p02DrawerRef("dma", dma.id) ? "is-selected" : ""}" type="button" data-action="select-dma" data-value="${dma.id}"><span class="product-tree-switch"></span><span class="product-tree-zone product-zone-${dma.zone}"></span><span><strong>${dma.id}</strong><small>${dma.name}</small></span>${dma.status === "正常" ? "" : '<i class="product-tree-warning"></i>'}</button>`).join("");
      return p02TreeBranch(group[0], group[1], items, p02DmaCatalog.filter(item => item.group === group[0]).length);
    }).join("");
    const dmaRoot = p02TreeBranch("dma-root", "DMA 分区", groupHtml, p02DmaCatalog.length);
    const savedItems = state.p02SavedSelections.length ? state.p02SavedSelections.map(item => `<button class="product-tree-row is-leaf" type="button" data-action="select-saved-set" data-value="${item.id}"><span class="product-tree-switch"></span><span class="product-tree-folder">◇</span><span><strong>${item.name}</strong><small>${item.objects.length} 个对象</small></span></button>`).join("") : '<div class="product-tree-empty">暂无自定义选择集</div>';
    return `<div class="product-selection-tree">${dmaRoot}${p02TreeBranch("custom-root", "自定义选择集", savedItems, state.p02SavedSelections.length)}</div>`;
  }

  function renderP02SearchResults(view) {
    const keyword = state.p02SearchQuery.trim().toLowerCase();
    const pipeResults = p02PipeCatalog.filter(item => !keyword || [item.id, item.name, item.diameter, item.material].some(value => value.toLowerCase().includes(keyword))).map(item => ({ ...item, kind: "pipe" }));
    const monitorResults = p02MonitorCatalog.filter(item => !keyword || [item.id, item.name, item.location, item.type].some(value => value.toLowerCase().includes(keyword))).map(item => ({ ...item, kind: "monitor" }));
    const dmaResults = p02DmaCatalog.filter(item => !keyword || [item.id, item.name].some(value => value.toLowerCase().includes(keyword))).map(item => ({ ...item, kind: "dma" }));
    const assetResults = p02AssetCatalog.filter(item => !keyword || [item.id, item.name, item.type, item.model, item.location].some(value => value.toLowerCase().includes(keyword))).map(item => ({ ...item, kind: "asset" }));
    const results = (view === "dma" ? [...dmaResults, ...monitorResults.filter(item => item.type === "flow" || item.type === "pressure")] : view === "assets" ? [...assetResults, ...pipeResults] : monitorResults).slice(0, 8);
    if (state.p02SearchExecuted && !results.length) return '<div class="app-empty product-search-empty"><div><div class="app-empty-mark"></div><span>未找到匹配对象</span></div></div>';
    return `<div class="product-selection-list">${results.map(item => `<button class="product-selection-item" type="button" data-action="${item.kind === "pipe" ? "select-pipe" : item.kind === "monitor" ? "select-monitor" : item.kind === "asset" ? "select-asset" : "select-dma"}" data-value="${item.id}" ${item.kind === "pipe" ? `data-pipe-id="${item.id}"` : ""}><span><strong>${item.id}</strong><small>${item.name}</small></span><small>${item.kind === "pipe" ? item.diameter : item.kind === "monitor" ? item.value : item.kind === "asset" ? item.type : item.status}</small></button>`).join("")}</div>`;
  }

  function renderP02OperationsQueue() {
    return `<div class="product-detail-list">${(topologyReadModel?.events||[]).map(e=>`<button class="product-detail-list-row" data-action="${e.type==='alarm'?'select-map-alarm':'select-workorder'}" data-value="${escapeHtml(e.id)}"><span><strong>${escapeHtml(e.name)}</strong><small>${escapeHtml(e.hostId)}</small></span>${tag(e.status,'warning')}</button>`).join('')||'<div class="app-empty">暂无待处理记录</div>'}</div>`;
  }

  function renderP02AssetTree() {
    const categories = ["水厂", "泵站", "阀门", "连接点", "用户端", "消火栓"];
    return `<div class="product-selection-tree">${categories.map(category => {
      const assets = p02AssetCatalog.filter(item => item.type === category);
      const key = `asset-${category}`;
      return p02TreeBranch(key, category, assets.map(asset => `<button class="product-tree-row is-leaf ${state.p02SelectedObjects.includes(asset.id) ? "is-selected" : ""}" type="button" data-action="select-asset" data-value="${asset.id}"><span class="product-tree-switch"></span><span class="product-tree-folder">◇</span><span><strong>${asset.id}</strong><small>${asset.name}</small></span>${asset.status === "待巡检" ? '<i class="product-tree-warning"></i>' : ""}</button>`).join(""), assets.length);
    }).join("")}${p02TreeBranch("asset-pipes", "管线", p02PipeCatalog.map(pipe => `<button class="product-tree-row is-leaf ${state.p02SelectedObjects.includes(pipe.id) ? "is-selected" : ""}" type="button" data-action="select-pipe" data-pipe-id="${pipe.id}" data-value="${pipe.id}"><span class="product-tree-switch"></span><span class="product-tree-folder">━</span><span><strong>${pipe.id}</strong><small>${pipe.name} · ${pipe.diameter}</small></span></button>`).join(""), p02PipeCatalog.length)}</div>`;
  }

  function layerStyleLabel(key) {
    return { pipes: "管线分类", dma: "DMA 分区颜色", nodes: "连接节点", valves: "阀门", pressure: "压力监测点", flow: "流量监测点", quality: "水质监测点", level: "水位监测点", alarms: "报警点", workorders: "工单点", plants: "水厂", pumps: "泵站", users: "用户端", hydrants:"消火栓", noise:"噪声仪", labels: "文字标注" }[key] || key;
  }

  function renderLayerRow(context, layers, key, label, count = "", configurable = true) {
    if(topologyReadModel){
      const types={nodes:'node',valves:'valve',plants:'plant',pumps:'pump',users:'user',hydrants:'hydrant'};
      if(types[key])count=topologyReadModel.data.nodes.filter(n=>(window.WaterStandard?.kind(n)||n.type)===types[key]).length;
      if(key==='pipes')count=topologyReadModel.pipes.length;
      if(key==='dma')count=topologyReadModel.zones.length;
      if(['pressure','flow','quality','level'].includes(key))count=topologyReadModel.monitors.filter(m=>m.type===key&&topologyReadModel.objects.has(m.hostId)).length;
      if(['alarms','workorders'].includes(key))count=topologyReadModel.events.filter(e=>e.type===(key==='alarms'?'alarm':'workorder')&&topologyReadModel.objects.has(e.hostId)).length;
    }
    if(topologyReadModel){const model=topologyReadModel,map={nodes:'node',valves:'valve',plants:'plant',pumps:'pump',users:'user',hydrants:'hydrant'};if(key==='pipes')count=context==='assets'?String(model.data.pipes.length):`${lengthText(model.totalLength/1000)} km`;else if(map[key])count=String(model.data.nodes.filter(n=>(window.WaterStandard?.kind(n)||n.type)===map[key]).length);else if(key==='dma')count=String(model.zones.length);else if(['flow','pressure','quality','level','noise'].includes(key))count=String(model.monitors.filter(m=>m.type===key).length);else if(key==='alarms'||key==='workorders')count=String(model.events.filter(e=>e.type===(key==='alarms'?'alarm':'workorder')).length);}
    const input = context === "scada" ? `data-p10-layer="${key}"` : `data-p02-layer="${key}" data-p02-view="${context}"`;
    return `<div class="product-layer-control-row"><label class="product-checkbox-row"><input type="checkbox" ${input} ${layers[key] ? "checked" : ""} /><span>${label}</span>${count ? `<span class="product-panel-count">${count}</span>` : ""}</label>${configurable ? `<button class="product-layer-style-button" type="button" data-action="open-layer-style" data-style-context="${context}" data-style-layer="${key}" aria-label="配置${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"></path><circle cx="16" cy="6" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg></button>` : ""}</div>`;
  }

  function mapStyleSelectOptions(min, max, current, suffix = "") {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index).map(value => `<option value="${value}" ${value === current ? "selected" : ""}>${suffix}${value}</option>`).join("");
  }

  function renderMapStyleField(label, context, type, key, property, value, options) {
    return `<label class="product-layer-style-field"><span>${label}</span><select class="app-select" data-map-style-control data-style-context="${context}" data-style-type="${type}" data-style-key="${key}" data-style-property="${property}">${options(value)}</select></label>`;
  }

  function renderPipeClassificationEditor(context, editorHeader) {
    const config = state.pipeClassifications[context];
    const definitions = pipeClassificationDefinitions(config);
    const isMaterial = config.field === "material";
    const canAdd = definitions.length < 6;
    const canRemove = definitions.length > 2;
    const boundaryValues = config.field === "age" ? [3, 5, 10, 15, 20, 30, 40, 50] : [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200];
    const boundarySelect = (value, index) => `<select class="app-select" data-pipe-class-boundary data-style-context="${context}" data-class-index="${index}">${[...new Set(boundaryValues.concat(value))].sort((a, b) => a - b).map(option => `<option value="${option}" ${option === value ? "selected" : ""}>${config.field === "diameter" ? "DN" : ""}${option}${config.field === "age" ? " 年" : ""}</option>`).join("")}</select>`;
    const rows = definitions.map((item, index) => `<div class="product-pipe-class-config-row"><div class="product-pipe-class-range"><span>${index + 1}</span><strong>${escapeHtml(item.label)}</strong></div>${isMaterial ? `<label><span>分类值</span><input class="app-input" value="${escapeHtml(config.values[index])}" data-pipe-class-value data-style-context="${context}" data-class-index="${index}" /></label>` : index < config.breaks.length ? `<label><span>区间上限</span>${boundarySelect(config.breaks[index], index)}</label>` : `<div class="product-pipe-class-open-range"><span>区间上限</span><strong>无上限</strong></div>`}<label class="product-pipe-class-color"><span>颜色</span><span class="product-color-control"><input type="color" value="${item.color}" data-pipe-class-color data-style-context="${context}" data-class-index="${index}" /><em>${item.color.toUpperCase()}</em></span></label><button class="app-button app-button-small app-text-danger" type="button" data-action="remove-pipe-class" data-style-context="${context}" data-class-index="${index}" ${canRemove ? "" : "disabled"} aria-label="删除${escapeHtml(item.label)}分类">删除</button></div>`).join("");
    return `${editorHeader}<div class="product-layer-style-editor product-pipe-class-editor"><label class="product-layer-style-field"><span>分类字段</span><select class="app-select" data-pipe-class-field data-style-context="${context}">${Object.entries(pipeClassificationFields).map(([key, item]) => `<option value="${key}" ${config.field === key ? "selected" : ""}>${item.label}</option>`).join("")}</select></label><div class="product-pipe-class-config-head"><div><strong>${isMaterial ? "分类数量" : "区间数量"}</strong><span>${definitions.length}</span></div><button class="app-button app-button-small" type="button" data-action="add-pipe-class" data-style-context="${context}" ${canAdd ? "" : "disabled"}>${isMaterial ? "新增分类" : "新增区间"}</button></div><div class="product-pipe-class-config-list">${rows}</div></div>`;
  }

  function renderDmaZoneColorEditor(editorHeader) {
    const levels = [...new Set(p02DmaCatalog.map(z => z.level))].sort((a,b) => a-b), readonly = !dmaMetadataEditable();
    return `${editorHeader}<div class="product-layer-style-editor product-dma-color-editor"><p class="app-text-tertiary">${readonly ? '历史分区颜色只读' : '修改颜色后自动保存至当前分区方案'}</p>${levels.map(level => `<section><strong>${level}级分区</strong><div>${p02DmaCatalog.filter(item => item.level === level).map(dma => `<label><span><i style="--dma-zone-color:${state.dmaZoneColors[dma.id]}"></i><strong>${escapeHtml(dma.id)}</strong><small>${escapeHtml(dma.name)}</small></span><span class="product-color-control"><input type="color" value="${state.dmaZoneColors[dma.id]}" data-dma-zone-color data-dma-id="${escapeHtml(dma.id)}" aria-label="${escapeHtml(dma.name)}分区颜色" ${readonly ? 'disabled' : ''} /><em>${state.dmaZoneColors[dma.id].toUpperCase()}</em></span></label>`).join('')}</div></section>`).join('')}</div>`;
  }

  function renderLayerStyleEditor(context, layer) {
    const config = state.mapLayerStyles[context];
    const zoom = context === "scada" ? state.p10Zoom : state.p02Zoom;
    const level = mapLevelFromZoom(zoom);
    const levelOptions = value => mapStyleSelectOptions(1, 18, value, "L");
    const pointSizeOptions = value => [8, 10, 12, 14, 16, 18, 20, 24].map(size => `<option value="${size}" ${size === value ? "selected" : ""}>${size}px</option>`).join("");
    const editorHeader = `<div class="product-layer-style-editor-header"><button type="button" data-action="close-layer-style" aria-label="返回图层列表">‹</button><div><strong>${layerStyleLabel(layer)}</strong><span>当前 L${level} · ${zoom}%</span></div><button class="app-button app-button-small" type="button" data-action="reset-layer-style" data-style-context="${context}" data-style-layer="${layer}">恢复默认</button></div>`;
    if (layer === "pipes") {
      return renderPipeClassificationEditor(context, editorHeader);
    }
    if (layer === "dma") return renderDmaZoneColorEditor(editorHeader);
    if (layer === "labels") {
      const item = config.labels;
      const fontOptions = value => mapStyleSelectOptions(10, 18, value).replace(/>(\d+)</g, ">$1px<");
      return `${editorHeader}<div class="product-layer-style-editor"><section class="product-layer-style-card"><div class="product-layer-style-card-title"><strong>文字标注</strong><span>L${item.min}–L${item.max}</span></div><div class="product-layer-style-grid">${renderMapStyleField("最小等级", context, "label", "labels", "min", item.min, levelOptions)}${renderMapStyleField("最大等级", context, "label", "labels", "max", item.max, levelOptions)}${renderMapStyleField("字体大小", context, "label", "labels", "fontSize", item.fontSize, fontOptions)}<label class="product-layer-style-field"><span>文字颜色</span><span class="product-color-control"><input type="color" value="${item.color}" data-map-style-control data-style-context="${context}" data-style-type="label" data-style-key="labels" data-style-property="color" /><em>${item.color.toUpperCase()}</em></span></label></div></section></div>`;
    }
    const item = config.points[layer];
    return `${editorHeader}<div class="product-layer-style-editor"><section class="product-layer-style-card"><div class="product-layer-style-card-title"><strong>${layerStyleLabel(layer)}</strong><span>L${item.min}–L${item.max}</span></div><div class="product-layer-style-grid">${renderMapStyleField("最小等级", context, "point", layer, "min", item.min, levelOptions)}${renderMapStyleField("最大等级", context, "point", layer, "max", item.max, levelOptions)}${renderMapStyleField("L1–L6 大小", context, "point", layer, "low", item.low, pointSizeOptions)}${renderMapStyleField("L7–L12 大小", context, "point", layer, "middle", item.middle, pointSizeOptions)}${renderMapStyleField("L13–L18 大小", context, "point", layer, "high", item.high, pointSizeOptions)}</div></section></div>`;
  }

  function renderP02Left(view, layers) {
    const row = (key, label, count = "", configurable = true) => renderLayerRow(view, layers, key, label, count, configurable);
    if (["p13","p15"].includes(state.page)) return `<div class="product-panel-section"><strong>业务图层</strong>${row("basemap","基础底图","",false)}${row("pipes","管网骨架","",false)}${state.page==="p13"?row("pressure","关联压力点")+row("alarms","当日报警"):row("workorders","工单与巡检")}${row("labels","业务标注")}</div>`;
    if (view === "dma") return `<div class="product-panel-section"><strong>分区底图</strong>${row("basemap", "基础底图", "", false)}${row("pipes", "分区管网", "1,286 km", false)}${row("dma", "DMA 分区面", "11")}${row("valves", isCampusProject()?"阀门":"边界阀门", "68")}</div><div class="product-panel-section"><strong>分区监测</strong>${row("flow", "进出口流量设备", "42")}${row("pressure", "压力监测设备", "86")}${row("quality", "水质指标", "18")}</div><div class="product-panel-section"><strong>专题标注</strong>${row("labels", "分区与指标标注")}</div>`;
    if (view === "assets") return `<div class="product-panel-section"><strong>基础资产</strong>${row("basemap", "基础底图", "", false)}${row("pipes", "管线", "2,836")}${row("nodes", "连接节点", "2,418")}${row("valves", "阀门", "728")}</div><div class="product-panel-section"><strong>设施资产</strong>${row("plants", "水厂", "3")}${row("pumps", "泵站", "12")}${row("users", "用户端", "4")}${row("hydrants", "消火栓", "")}</div><div class="product-panel-section"><strong>资产标注</strong>${row("labels", "资产名称与编号")}</div>`;
    return `<div class="product-panel-section"><strong>运行底图</strong>${row("basemap", "基础底图", "", false)}${row("pipes", "管网骨架", `${(topologyReadModel.totalLength/1000).toFixed(2)} km`, false)}</div><div class="product-panel-section"><strong>实时监测</strong>${row("pressure", "压力", p02MonitorCatalog.filter(m=>m.type==="pressure").length)}${row("flow", "流量", p02MonitorCatalog.filter(m=>m.type==="flow").length)}${row("quality", "水质", p02MonitorCatalog.filter(m=>m.type==="quality").length)}${row("level", "水位", p02MonitorCatalog.filter(m=>m.type==="level").length)}${row("noise", "噪声仪", "")}${row("hydrants", "消火栓", "")}</div><div class="product-panel-section"><strong>运维业务</strong>${row("alarms", "报警", "3")}${row("workorders", "工单", "4")}</div><div class="product-panel-section"><strong>业务标注</strong>${row("labels", "监测、报警与工单")}</div>`;
  }


  function topologyStore() {
    const key=state.activeProjectId || "PRJ-001";
    if(key===window.CampusProject?.projectId)window.CampusProject.initialize();
    if(!state.topologyProjects[key]){try{const saved=JSON.parse(localStorage.getItem('water-topology-store:'+key));if(saved?.versions?.length&&Array.isArray(saved.bindings)&&Array.isArray(saved.bindingHistory))state.topologyProjects[key]=saved;}catch(_){}}
    if(!state.topologyProjects[key]&&key===window.SuizhouProject?.projectId)state.topologyProjects[key]=window.SuizhouProject.store();
    if(!state.topologyProjects[key]) state.topologyProjects[key]={
      versions:[{id:"T3",name:"城市主干管网",status:"使用中",published:"2026-09-10"},{id:"T0",name:"原简版管网",status:"历史",published:"2026-09-10"}],
      bindings:[], bindingHistory:[], epochs:[{topology:"T3",start:"2026-09-10",end:null}]
    };
    return state.topologyProjects[key];
  }
  function activeTopology(){return topologyStore().versions.find(t=>t.status==="使用中");}
  function selectedTopology(){return topologyStore().versions.find(t=>t.id===state.selectedTopology);}
  function persistTopologyStore(){localStorage.setItem('water-topology-store:'+(state.activeProjectId||'PRJ-001'),JSON.stringify(topologyStore()));}
  let deviceBindingUI;
  function deviceBinding(){
    if(!deviceBindingUI)deviceBindingUI=new window.WaterDeviceBinding.DeviceBinding({render,persist:persistTopologyStore,versionName:()=>selectedTopology()?.name||''});
    deviceBindingUI.use(state.activeProjectId||'PRJ-001',state.selectedTopology,topologyStore(),topologyReadModel);
    return deviceBindingUI;
  }
  let standardUI;
  function standardProduct(){
    if(!standardUI)standardUI=new window.StandardProductUI(()=>({
      project:state.activeProjectId,version:state.selectedTopology,model:topologyReadModel,binding:deviceBinding(),monthlyExamples:dmaDemoEnabled(),render,
      operations:()=>operations().load(),seedScenario:createStandardScenario,
      openAlarm(id){operations().open('p13',id);},
      locateZone(id){state.p02SelectedObjects=[id];state.p02Drawer='dma:'+id;navigate('p02dma');},
      createOrder(row){const db=operations().load(),host=topologyReadModel.data.zones.find(z=>z.id===row.zoneId)?.nodeIds[0];if(!host)throw Error('分区没有有效对象，无法建立工单');const existing=db.orders.find(w=>w.findingId===row.id);if(existing)return existing.id;const w=window.WaterOperations.createOrder(db,{name:row.zoneName+'漏损核查',findingId:row.id,hostId:host,topology:state.selectedTopology,assignee:'管线巡检班',priority:'普通',instructions:row.date+' 同期水量异常，请核查计量、合法用水与现场情况',dueAt:new Date(Date.now()+86400000).toISOString()},topologyReadModel.data);localStorage.setItem(`water-operations:v1:${state.activeProjectId}`,JSON.stringify(db));return w.id;}
    }));return standardUI;
  }
  function createStandardScenario(){
    const S=window.WaterStandard,store=topologyStore(),source=activeTopology(),ui=deviceBinding();
    if(store.standardDeviceScenario&&store.versions.some(v=>v.id===store.standardDeviceScenario)){store.versions.forEach(v=>{if(v.status==='使用中')v.status='已发布';});store.versions.find(v=>v.id===store.standardDeviceScenario).status='使用中';state.selectedTopology=store.standardDeviceScenario;persistTopologyStore();return;}
    const data=S.copy(topologyEditor().s.saved),version='T'+(Math.max(0,...store.versions.map(v=>Number(v.id.slice(1))||0))+1),stamp=new Date().toLocaleString('sv-SE');
    let valve=data.nodes.find(n=>n.type==='valve');const base=data.nodes[0];if(!base)throw Error('请先建立拓扑对象');
    const unique=prefix=>{let id=prefix,i=1;while(data.nodes.some(n=>n.id===id)||data.pipes.some(n=>n.id===id))id=prefix+'-'+i++;return id;};
    if(!valve){valve={id:unique('STD-VALVE'),type:'valve',name:'设备场景阀门',x:base.x+16,y:base.y+10,elevation:base.elevation||0,diameter:100};data.nodes.push(valve);data.pipes.push({id:unique('STD-VALVE-PIPE'),type:'pipe',name:'场景阀门接入管',start:base.id,end:valve.id,a:{x:base.x,y:base.y},b:{x:valve.x,y:valve.y},length:20,diameter:100,material:'球墨铸铁'});}
    const hydrant={id:unique('STD-HYDRANT'),type:'user',userSubtype:'FIRE_HYDRANT',name:'东门消火栓',x:valve.x+22,y:valve.y+20,elevation:valve.elevation||0,diameter:100};data.nodes.push(hydrant);
    const pipe={id:unique('STD-HYDRANT-PIPE'),type:'pipe',name:'消火栓接入管',start:valve.id,end:hydrant.id,a:{x:valve.x,y:valve.y},b:{x:hydrant.x,y:hydrant.y},length:30,diameter:100,material:'球墨铸铁'};data.pipes.push(pipe);
    const zone=data.zones.find(z=>z.nodeIds.includes(valve.id));if(zone){zone.nodeIds.push(hydrant.id);zone.pipeIds.push(pipe.id);}
    if(!data.zones.length)data.zones.push({id:'STD-DMA',name:'标准设备示例分区',type:'zone',parent:'',nodeIds:[...new Set([base.id,valve.id,hydrant.id])],pipeIds:data.pipes.filter(p=>p.id===pipe.id||p.end===valve.id).map(p=>p.id)});
    const suffix=Date.now().toString(36),defs=[['STD-N-'+suffix,'noise','阀门噪声仪',valve.id,36],['STD-H-'+suffix,'hydrant','东门消火栓设备',hydrant.id,.31],['STD-R-'+suffix,'rtu','片区 RTU','',null],['STD-M-'+suffix,'valveMeter','阀控水表',pipe.id,28]];
    const devices=defs.map(([id,type,name,hostId,value])=>{const t=S.types[type],samples=[];if(type!=='rtu')for(let i=167;i>=0;i--){const dt=new Date(Date.now()-i*3600000);samples.push({time:dt.toLocaleString('sv-SE'),metric:t[1],value:+(value*(1+.1*Math.sin(i/5))).toFixed(3),unit:t[2],quality:'GOOD'});if(type==='hydrant')samples.push({time:dt.toLocaleString('sv-SE'),metric:'outflow',value:i%24===4?'出水':'关闭',unit:'',quality:'GOOD'});}return {id,type,metric:t[1],name,hostId,unit:t[2],value,location:name,interval:300,status:'启用',online:'在线',quality:'GOOD',sampleTime:stamp,lastCommunication:stamp,samples,source:'标准场景',alarmEnabled:type==='hydrant',outflow:type==='hydrant'?'关闭':undefined,valvePosition:type==='valveMeter'?'开启':undefined};});
    devices.filter(d=>d.type!=='rtu').forEach(d=>d.rtuId=devices.find(d=>d.type==='rtu').id);
    for(const p of data.pipes){const a=data.nodes.find(n=>n.id===p.start),b=data.nodes.find(n=>n.id===p.end);if(p.startElevation===undefined)p.startElevation=a?.elevation??0;if(p.endElevation===undefined)p.endElevation=b?.elevation??0;}
    topologyEditor().validate(data);
    localStorage.setItem(`water-editor:${state.activeProjectId}:${version}`,JSON.stringify(data));
    window.WaterDeviceBinding.inherit(store,source.id,version);source.status='已发布';store.versions.push({id:version,name:'标准设备与漏损场景',status:'使用中',published:stamp,source:source.id});store.standardDeviceScenario=version;
    store.epochs.filter(e=>!e.end).forEach(e=>e.end=stamp);store.epochs.push({topology:version,start:stamp,end:null});
    for(const d of devices.filter(d=>d.hostId))store.bindings.push({key:[version,d.hostId,d.metric].join('|'),devices:[d.id],rule:'average',revision:1,start:stamp});
    ui.devices.push(...devices);ui.persist();state.selectedTopology=version;
    const db=operations().load(),d=devices.find(d=>d.type==='hydrant');S.alarm(db,d,hydrant.id,version,{id:'STANDARD-LOW-PRESSURE',name:'压力异常',abnormal:true,value:'设备低压事件',time:new Date().toISOString()});localStorage.setItem(`water-operations:v1:${state.activeProjectId}`,JSON.stringify(db));
    const key='water-standard:'+state.activeProjectId,standard=JSON.parse(localStorage.getItem(key)||'null')||{reports:[],imports:[],balances:[],rule:null};
    for(const [index,z] of data.zones.entries())for(let i=6;i>=0;i--){const dt=new Date(Date.now()-i*86400000);standard.balances.push({id:'BAL-'+suffix+'-'+index+'-'+i,topology:version,zoneId:z.id,zoneName:z.name,date:dt.toLocaleDateString('sv-SE'),inlet:1200+index*100,outlet:200,storage:50,billed:850+index*60-i*8,unbilled:20,night:10+index*6+i,quality:'GOOD',source:'标准场景'});}
    standard.rule=standard.rule||{lossRate:12,nightFlow:20,revision:1,source:'标准场景'};localStorage.setItem(key,JSON.stringify(standard));persistTopologyStore();
  }
  function renderDeviceManagement(){return standardProduct().render("devices");}
  function renderBindingManagement(){
    const ui=deviceBinding(),wrapper=document.createElement('div');
    wrapper.innerHTML=topologyReadRenderer.map(true,{dma:true,points:false,selectedIds:[ui.object]});
    const svg=wrapper.querySelector('svg');svg.classList.add('unified-topology-svg');
    const boundObjects=new Set(topologyStore().bindings.filter(b=>b.key.split('|')[0]===state.selectedTopology).map(b=>b.key.split('|')[1]));
    svg.querySelectorAll('[data-action]').forEach(el=>{el.dataset.db='object';el.removeAttribute('data-action');if(boundObjects.has(el.dataset.value))el.classList.add('db-is-bound');if(el.dataset.value===ui.object)el.classList.add('is-selected');});
    if(ui.object&&topologyReadModel.objects.has(ui.object)){
      const focus=Object.create(topologyReadRenderer);focus.s={...topologyReadRenderer.s,view:[0,0,900,540]};focus.fit([ui.object]);svg.setAttribute('viewBox',focus.s.view.join(' '));
    }
    return ui.bindingPage(wrapper.innerHTML);
  }
  function renderP03(){
    const rows=topologyStore().versions.filter(t=>(!state.topologyQuery||t.name.includes(state.topologyQuery))&&(!state.topologyStatus||t.status===state.topologyStatus));
    return `<div class="product-page product-page-stack">${pageHeader("p03",'<button class="app-button app-button-primary" data-action="topology-new">新建拓扑</button>')}
      <section class="app-search-panel"><div class="product-bottom-filterbar"><input id="topologyQuery" class="app-input" placeholder="查询拓扑名称" value="${escapeHtml(state.topologyQuery)}"><select id="topologyStatus" class="app-select" aria-label="拓扑状态"><option value="">全部状态</option>${["已发布","使用中","编辑中","已废弃"].map(v=>`<option ${state.topologyStatus===v?"selected":""}>${v}</option>`).join("")}</select><button class="app-button app-button-primary" data-action="topology-query">查询</button><button class="app-button" data-action="topology-reset">重置</button></div></section>
      <div class="app-alert"><div><strong>使用中：${activeTopology()?.name||"未设置"}</strong><div></div></div></div>
      <div class="app-table-wrap"><table class="app-table"><thead><tr><th>版本</th><th>拓扑名称</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.id}</td><td><strong>${t.name}</strong></td><td>${tag(t.status,t.status==="使用中"?"success":t.status==="编辑中"?"warning":t.status==="已发布"?"blue":"")}</td><td>${t.published}</td><td><div class="app-table-actions"><button class="app-button app-button-link" data-action="topology-open" data-value="${t.id}">${t.id==="T0"?"查看":"编辑"}</button><button class="app-button app-button-link" data-action="topology-devices" data-value="${t.id}">设备配置</button><button class="app-button app-button-link" data-action="topology-copy" data-value="${t.id}">基于此创建</button>${t.status==="编辑中"?`<button class="app-button app-button-link" data-action="topology-publish" data-value="${t.id}">发布</button>`:""}${t.status==="已发布"?`<button class="app-button app-button-link" data-action="topology-use" data-value="${t.id}">设为使用中</button>`:""}${["编辑中","已发布"].includes(t.status)?`<button class="app-button app-button-link app-text-danger" data-action="topology-retire" data-value="${t.id}">废弃</button>`:""}<button class="app-button app-button-link" data-action="topology-export" data-value="${t.id}">导出</button><button class="app-button app-button-link" data-action="topology-compare" data-value="${t.id}">对比</button></div></td></tr>`).join("")}</tbody></table></div></div>`;
  }

  const bindingMetrics={flow:{label:"流量",unit:"m³/h"},pressure:{label:"压力",unit:"MPa"},quality:{label:"水质 · 余氯",unit:"mg/L"},level:{label:"水位",unit:"m"}};
  const bindingObjects=[{id:"PLANT-001",name:"第一水厂"},{id:"PUMP-001",name:"城西加压泵站"},{id:"VALVE-V301",name:"南干线控制阀"},{id:"USER-SOUTH",name:"南区用户"}];
  const bindingDevices=[
    {id:"FT-001",type:"flow",name:"出厂流量表 1",value:620},{id:"FT-002",type:"flow",name:"出厂流量表 2",value:666},{id:"PT-001",type:"pressure",name:"出厂压力表 1",value:.328},{id:"PT-002",type:"pressure",name:"出厂压力表 2",value:.336},
    {id:"WQ-001",type:"quality",name:"余氯仪 1",value:.32},{id:"WQ-002",type:"quality",name:"余氯仪 2",value:.34},{id:"LT-001",type:"level",name:"清水池水位计 1",value:4.82},{id:"LT-002",type:"level",name:"清水池水位计 2",value:4.76}
  ];
  function bindingKey(){return [state.selectedTopology,state.bindingObject,state.bindingMetric].join("|");}
  function bindingConfig(){
    if(state.bindingDraft?.key===bindingKey()) return state.bindingDraft;
    const saved=topologyStore().bindings.find(b=>b.key===bindingKey());
    state.bindingDraft=saved?JSON.parse(JSON.stringify(saved)):{key:bindingKey(),devices:[],rule:state.bindingMetric==="flow"?"sum":"average"};
    return state.bindingDraft;
  }
  function renderObjectBinding(){
    const topology=selectedTopology(), config=bindingConfig(), metric=bindingMetrics[state.bindingMetric];
    const devices=bindingDevices.filter(d=>d.type===state.bindingMetric);
    const chosen=devices.filter(d=>config.devices.includes(d.id));
    const result=chosen.length?+(chosen.reduce((sum,d)=>sum+d.value,0)/(config.rule==="average"?chosen.length:1)).toFixed(3):null;
    const saved=topologyStore().bindings.find(b=>b.key===bindingKey());
    return `<div class="product-page product-page-stack">${pageHeader("p12")}
      <section class="app-card app-card-body"><div class="u-flex u-gap-2">${tag(topologyReadModel?.history?"历史只读":topology?.status||"查看","success")}<strong>${topology?.name||"暂无拓扑"}</strong><span>${topology?.id||""}</span></div></section>
      <div class="product-binding-rule-layout"><aside class="app-card app-card-body"><h2 class="app-section-title">业务对象</h2>${bindingObjects.map(o=>`<button class="product-list-row ${state.bindingObject===o.id?"is-selected":""}" data-action="binding-object" data-value="${o.id}"><strong>${o.name}</strong><small>${o.id}</small></button>`).join("")}</aside>
      <section class="app-card app-card-body"><div class="app-tabs">${Object.entries(bindingMetrics).map(([id,m])=>`<button class="app-tab ${state.bindingMetric===id?"is-active":""}" data-action="binding-metric" data-value="${id}">${m.label}</button>`).join("")}</div>
      <h2 class="app-section-title u-mt-4">设备挂接</h2><table class="app-table"><thead><tr><th>挂接</th><th>设备编号</th><th>名称</th><th>最新有效值</th><th>单位</th></tr></thead><tbody>${devices.map(d=>`<tr><td><input type="checkbox" aria-label="挂接 ${d.id}" data-binding-device="${d.id}" ${config.devices.includes(d.id)?"checked":""}></td><td>${d.id}</td><td>${d.name}</td><td>${d.value}</td><td>${metric.unit}</td></tr>`).join("")}</tbody></table>
      <div class="product-rule-settings"><label>数据处理规则<select class="app-select" aria-label="数据处理规则" data-binding-rule><option value="average" ${config.rule==="average"?"selected":""}>平均值</option><option value="sum" ${config.rule==="sum"?"selected":""}>加和</option></select></label><div><span>同一采样时刻有效设备：${chosen.length} 个</span><strong class="product-rule-result">${result===null?"—":result} ${metric.unit}</strong></div></div>
      <div class="app-text-secondary">采样粒度：5 分钟；仅汇总同指标、同单位且质量码 GOOD 的同期数据。无有效数据时记录为空。</div>
      <div class="u-flex u-gap-2 u-mt-4"><button class="app-button app-button-primary" data-action="binding-save" ${!topology||!chosen.length?"disabled":""}>保存挂接与规则</button><button class="app-button" data-action="binding-cancel">恢复已保存配置</button></div><p role="status">${escapeHtml(state.bindingMessage)}</p>
      <div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">规则版本</div><div class="app-description-value">${saved?.revision||"尚未保存"}</div></div><div class="app-description-item"><div class="app-description-label">生效时间</div><div class="app-description-value">${saved?.start||"—"}</div></div><div class="app-description-item"><div class="app-description-label">时序归属</div><div class="app-description-value">${topology?.id||"—"} / ${state.bindingObject} / ${metric.label}</div></div><div class="app-description-item"><div class="app-description-label">原始设备数据</div><div class="app-description-value">按设备独立保留</div></div></div>
      </section></div>
      <section class="app-card app-card-body"><h2 class="app-section-title">挂接与规则历史</h2><table class="app-table"><thead><tr><th>拓扑</th><th>对象 / 指标</th><th>设备</th><th>规则</th><th>版本</th><th>生效时间</th><th>结束时间</th></tr></thead><tbody>${[...topologyStore().bindings,...topologyStore().bindingHistory].map(b=>`<tr><td>${b.key.split("|")[0]}</td><td>${b.key.split("|").slice(1).join(" / ")}</td><td>${b.devices.join(", ")}</td><td>${b.rule==="sum"?"加和":"平均值"}</td><td>${b.revision}</td><td>${b.start}</td><td>${b.end||"当前有效"}</td></tr>`).join("")||'<tr><td colspan="7">暂无保存记录</td></tr>'}</tbody></table></section></div>`;
  }

  function topologyCheckIcon(category) {
    const paths = {
      connectivity: '<circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="7" r="2.5"></circle><circle cx="18" cy="17" r="2.5"></circle><path d="M8.4 11 15.6 8M8.4 13l7.2 3"></path>',
      island: '<path d="M4 8.5 8 4l5 2 4-2 3 4-1 5 1 4-5 3-4-2-5 1-2-4 1-3Z"></path><path d="M9 10.5h6M12 8v5"></path>',
      diameter: '<path d="M3 9h7v6H3zM14 6h7v12h-7zM10 12h4"></path>',
      elevation: '<path d="M3 18 9 8l4 6 3-5 5 9"></path><path d="M4 5h7M7.5 2v6"></path>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[category] || paths.connectivity}</svg>`;
  }

  function renderP04EditTools(canEdit) {
    const disabled = canEdit ? "" : "disabled";
    return `<div class="product-tool-group"><strong>新增点要素</strong><div class="product-tool-grid"><button class="app-button" type="button" data-action="edit-tool" ${disabled}>连接节点</button><button class="app-button" type="button" data-action="edit-tool" ${disabled}>阀门</button><button class="app-button" type="button" data-action="edit-tool" ${disabled}>泵站</button><button class="app-button" type="button" data-action="edit-tool" ${disabled}>水厂</button><button class="app-button" type="button" data-action="edit-tool" ${disabled}>用户端</button></div></div><div class="product-tool-group"><strong>新增线要素</strong><div class="product-tool-grid"><button class="app-button" type="button" data-action="edit-tool" ${disabled}>供水管线</button></div></div><div class="product-tool-group"><strong>修改</strong><div class="product-tool-grid"><button class="app-button" type="button" ${disabled}>移动点</button><button class="app-button" type="button" ${disabled}>编辑线</button><button class="app-button" type="button" ${disabled}>修改属性</button></div></div><div class="product-tool-group"><strong>拓扑</strong><div class="product-tool-grid"><button class="app-button ${state.p04SplitDone ? "is-active" : ""}" type="button" data-action="split-pipe" ${disabled}>分割管线</button><button class="app-button" type="button" data-action="merge-node" ${disabled}>合并节点</button><button class="app-button" type="button" ${disabled}>合并管线</button><button class="app-button" type="button" ${disabled}>建立连接</button><button class="app-button" type="button" ${disabled}>断开连接</button></div></div><div class="product-tool-group"><strong>批量</strong><div class="product-tool-grid"><button class="app-button" type="button">框选</button><button class="app-button" type="button">多边形选择</button><button class="app-button" type="button" ${disabled}>批量修改</button><button class="app-button app-button-danger" type="button" ${disabled}>删除</button></div></div>`;
  }

  function renderP04CheckTools() {
    const issues = p05VisibleIssues();
    const activeCategory = topologyCheckCategories.find(item => item.id === state.p05Category) || topologyCheckCategories[0];
    const selectedIslandCount = state.p05SelectedIslands.filter(id => !state.p05DeletedIslands.includes(id)).length;
    const canDeleteIslands = selectedTopology()?.status === "编辑中";
    return `<div class="product-check-tool-grid" role="toolbar" aria-label="拓扑检查">
      ${topologyCheckCategories.map(category => {
        const count = p05VisibleIssues(category.id).length;
        return `<button class="product-check-tool ${state.p05Category === category.id ? "is-active" : ""}" type="button" data-action="p05-category" data-value="${category.id}" title="${category.label}" aria-label="${category.label}">${topologyCheckIcon(category.id)}<span>${category.label}</span></button>`;
      }).join("")}
    </div>${state.p05Running ? '<div class="product-check-running"><span class="product-spinner"></span><strong>检查中</strong></div>' : ""}
    <div class="product-check-list-head"><strong>${activeCategory.label}</strong><span>共 ${issues.length} 条</span>${state.p05Category === "island" ? `<button class="app-button app-button-small app-button-danger" type="button" data-action="delete-selected-islands" ${selectedIslandCount && canDeleteIslands ? "" : "disabled"}>删除${selectedIslandCount ? ` (${selectedIslandCount})` : ""}</button>` : ""}</div>
    <div class="product-check-issue-list">${renderP05IssueList(issues)}</div>`;
  }

  function renderP04IssueDetail(issue) {
    if (!issue) return '<div class="app-empty">请选择问题</div>';
    const rows = [["问题类型", issue.subtype], ["对象类型", issue.objectType], ["对象编号", issue.objectId], ...issue.fields.map(field => [field[0], field[1], field[2]])];
    return `<div class="product-pane-header"><strong>问题属性</strong></div><div class="product-check-field-table">${rows.map(field => `<div class="product-check-field-row ${field[2] ? "is-problem" : ""}"><span>${field[0]}</span><strong>${field[1]}</strong></div>`).join("")}</div>${issue.category === "island" ? '<div class="product-pane-body"><button class="app-button" type="button" data-action="save-selection-set">保存选择集</button></div>' : ""}`;
  }

  function renderP04EditDetail() {
    return `<div class="product-pane-header"><strong>属性 / 拓扑关系</strong>${tag("Pipe 已选中", "blue")}</div><div class="product-pane-body product-detail-stack"><div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">Pipe ID</div><div class="app-description-value">PIPE-2026-010</div></div><div class="app-description-item"><div class="app-description-label">Asset ID</div><div class="app-description-value">ASSET-P-010</div></div><div class="app-description-item"><div class="app-description-label">起点</div><div class="app-description-value">VALVE-V301</div></div><div class="app-description-item"><div class="app-description-label">终点</div><div class="app-description-value">NODE-J04</div></div></div><label class="app-form-item"><span class="app-form-label">管径</span><select class="app-select"><option>DN500</option><option>DN400</option></select></label><label class="app-form-item"><span class="app-form-label">材质</span><select class="app-select"><option>球墨铸铁</option><option>钢管</option></select></label><div class="app-alert app-alert-warning"><div><div class="app-alert-title">强拓扑约束</div><div class="app-alert-description">删除已连接 Node 前必须先处理相连 Pipe；分割和合并操作按事务整体提交。</div></div></div></div>`;
  }

  function renderP04() {
    const checkRequested = state.p04Toolbox === "check";
    state.p04Toolbox = "edit";
    return topologyEditor().render(false, checkRequested);
  }

  function renderLegacyP04() {
    const current = selectedTopology();
    const canEdit = current?.status === "编辑中";
    const checkMode = state.p04Toolbox === "check";
    const issue = checkMode ? p05SelectedIssue() : null;
    if (issue && issue.id !== state.p05Issue) state.p05Issue = issue.id;
    const saveState = canEdit ? (state.p04Dirty ? tag("未保存", "warning") : tag("已保存", "success")) : tag("只读");
    return `<div class="product-page product-page-stack product-editor-page">${pageHeader("p04", `${saveState}<button class="app-button" type="button" data-action="undo" ${canEdit ? "" : "disabled"}>撤销</button><button class="app-button" type="button" data-action="redo" ${canEdit ? "" : "disabled"}>重做</button><button class="app-button app-button-primary" type="button" data-action="save-edit" ${canEdit && state.p04Dirty ? "" : "disabled"}>保存</button><button class="app-button" type="button" data-action="run-check">${state.p05Running ? "检查中…" : "运行检查"}</button>`)}
      <div class="product-editor-shell ${checkMode ? "is-check-mode" : "is-edit-mode"}"><aside class="product-editor-left"><div class="product-editor-toolbox-tabs" role="tablist"><button class="${checkMode ? "" : "is-active"}" type="button" data-action="p04-toolbox" data-value="edit" role="tab" aria-selected="${!checkMode}">编辑工具箱</button><button class="${checkMode ? "is-active" : ""}" type="button" data-action="p04-toolbox" data-value="check" role="tab" aria-selected="${checkMode}">检查工具箱</button></div>${checkMode ? renderP04CheckTools() : renderP04EditTools(canEdit)}</aside>
      <section class="product-editor-map ${checkMode ? "product-topology-check-map" : ""}" style="--p05-focus-x:${issue?.x || 50}%;--p05-focus-y:${issue?.y || 50}%;--p05-scale:${issue?.category === "island" ? 1.22 : 1.42}">${networkMap({ points: false, checkIssue: issue })}<div class="app-gis-toolbar"><button class="app-button app-button-icon" type="button" aria-label="放大">＋</button><button class="app-button app-button-icon" type="button" aria-label="缩小">−</button>${checkMode ? '<button class="app-button" type="button" data-action="run-check-now">复检</button>' : '<button class="app-button" type="button">吸附：开</button><button class="app-button" type="button">拓扑约束：开</button>'}</div>${!checkMode && state.p04SplitDone ? '<button class="product-map-point product-point-c is-warning" type="button">NODE-NEW</button>' : ""}${checkMode && issue ? `<div class="product-check-map-caption"><strong>${issue.objectId}</strong><span>${issue.position} · ${issue.zoom}</span></div>` : ""}</section>
      <aside class="product-editor-right ${checkMode ? "product-check-detail-drawer" : ""}">${checkMode ? renderP04IssueDetail(issue) : renderP04EditDetail()}</aside></div></div>`;
  }

  function p05VisibleIssues(category = state.p05Category) {
    return topologyCheckIssues.filter(issue => issue.category === category && !state.p05DeletedIslands.includes(issue.id));
  }

  function p05SelectedIssue() {
    const visible = p05VisibleIssues();
    return visible.find(issue => issue.id === state.p05Issue) || visible[0];
  }

  function renderP05IssueList(issues) {
    if (!issues.length) return '<div class="app-empty"><div><div class="app-empty-mark"></div>该类型问题已处理完成</div></div>';
    const canDelete = selectedTopology()?.status === "编辑中";
    let currentSubtype = "";
    return issues.map(issue => {
      const subtype = issue.subtype !== currentSubtype ? `<div class="product-check-subtype"><strong>${issue.subtype}</strong><span>${issues.filter(item => item.subtype === issue.subtype).length} 条</span></div>` : "";
      currentSubtype = issue.subtype;
      const issueButton = `<button class="product-list-row ${state.p05Issue === issue.id ? "is-selected" : ""}" type="button" data-action="select-issue" data-value="${issue.id}"><span class="product-list-row-main"><strong>${issue.objectId}</strong><small>${issue.title}</small></span></button>`;
      if (issue.category !== "island") return subtype + issueButton;
      return `${subtype}<div class="product-check-island-row ${state.p05Issue === issue.id ? "is-selected" : ""}"><label class="product-check-island-select" title="${canDelete ? `选择 ${issue.objectId}` : "只读拓扑不可删除"}"><input type="checkbox" data-action="toggle-island-selection" data-value="${issue.id}" ${state.p05SelectedIslands.includes(issue.id) ? "checked" : ""} ${canDelete ? "" : "disabled"} aria-label="选择 ${issue.objectId}" /></label>${issueButton}</div>`;
    }).join("");
  }

  function renderP05() {
    state.p04Toolbox = "check";
    return renderP04();
  }

  function dmaBucket(){return window.DMAPlans.ensure(topologyStore(),state.selectedTopology,topologyEditor().s.saved);}
  function dmaPlan(){const bucket=dmaBucket();return bucket.items.find(p=>p.id===state.dmaPlanId)||bucket.items.find(p=>p.id===bucket.activeId);}
  function renderP06() {
    const bucket=dmaBucket(),base=topologyEditor().s.saved;
    const form=state.dmaPlanForm;
    return `<div class="product-page product-page-stack">${pageHeader("p06",'<button class="app-button" data-page="p06compare">方案对比</button><button class="app-button app-button-primary" data-action="dma-plan-new">新建方案</button>')}<strong>所属拓扑：${escapeHtml(state.selectedTopology+' · '+selectedTopology().name)}</strong>${form?`<section class="app-search-panel"><label>方案名称<input id="dmaPlanName" class="app-input" maxlength="60" value="${escapeHtml(form.name)}"></label><button class="app-button app-button-primary" data-action="dma-plan-confirm">保存</button><button class="app-button" data-action="dma-plan-cancel">取消</button></section>`:''}${state.dmaActivate?`<section class="app-search-panel"><strong>设为在用：${escapeHtml(bucket.items.find(p=>p.id===state.dmaActivate)?.name||'')}</strong><p>启用后，日常 DMA 地图改用此方案；原方案保留。</p><button class="app-button app-button-primary" data-action="dma-plan-activate-confirm">确认启用</button><button class="app-button" data-action="dma-plan-cancel">取消</button></section>`:''}<table class="app-table"><thead><tr><th>方案</th><th>状态</th><th>分区数</th><th>未分配点 / 线</th><th>边界管线</th><th>重复 / 无效成员</th><th>空间重叠</th><th>来源</th><th>操作</th></tr></thead><tbody>${bucket.items.map(p=>{const m=window.DMAPlans.stats(base,p.zones);return `<tr><td><strong>${escapeHtml(p.name)}</strong><small class="product-table-subline">${p.id}</small></td><td>${p.id===bucket.activeId?'在用':'试验'}</td><td>${m.zones}</td><td>${m.unassignedNodes} / ${m.unassignedPipes}</td><td>${m.boundaries}</td><td>${m.overlap} / ${m.invalid}</td><td>${m.spatialOverlap} 对</td><td>${escapeHtml(p.source||'—')}</td><td>${[['open','查看'],...(p.id!==bucket.activeId?[['edit','编辑']]:[]),['copy','复制'],['rename','重命名'],['compare','对比'],...(p.id!==bucket.activeId?[['activate','设为在用']]:[])].map(([action,label])=>`<button class="app-button app-button-link" data-action="dma-plan-${action}" data-value="${p.id}">${label}</button>`).join('')}</td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function renderP07() {
    const base=topologyEditor().s.saved,bucket=dmaBucket(),plan=dmaPlan(),editor=liveTopologyEditor;
    const key=state.activeProjectId+':'+state.selectedTopology+':dma:'+plan.id;
    editor.use(key,'',{data:{...JSON.parse(JSON.stringify(base)),zones:JSON.parse(JSON.stringify(plan.zones))},preserve:true,readOnly:plan.id===bucket.activeId||state.selectedTopology==='T0'});
    // Geometry always comes from the topology; only the selected scheme owns zones.
    for(const k of ['nodes','pipes']){editor.s.data[k]=JSON.parse(JSON.stringify(base[k]));editor.s.saved[k]=JSON.parse(JSON.stringify(base[k]));}
    if(state.dmaEnterEdit&&plan.id!==bucket.activeId){editor.mode='dma';editor.s.editing=true;editor.s.tab='edit';state.dmaEnterEdit=false;}
    const options=bucket.items.map(p=>`<option value="${p.id}" ${p.id===plan.id?'selected':''}>${escapeHtml(p.name)}${p.id===bucket.activeId?' · 在用只读':' · 试验'}</option>`).join('');
    return `<div class="dma-editor-page"><div class="app-toolbar" style="padding:8px 16px"><strong>${escapeHtml(state.selectedTopology)} · DMA 方案</strong><select class="app-select" id="dmaEditorPlan" aria-label="编辑分区方案">${options}</select><button class="app-button" data-action="dma-plan-copy" data-value="${plan.id}">复制为试验方案</button><button class="app-button" data-page="p06">方案管理</button></div>`+editor.render(true)+'</div>';
  }
  function comparisonTabs(dma=false){
    return `<div class="app-toolbar"><button class="app-button ${!dma?'app-button-primary':''}" data-page="p08">拓扑版本对比</button><button class="app-button ${dma?'app-button-primary':''}" data-page="p06compare">DMA 方案对比</button></div>`;
  }
  function renderDMACompare(){
    const bucket=dmaBucket(),base=topologyEditor().s.saved;
    const a=bucket.items.find(p=>p.id===state.dmaCompareA)||bucket.items.find(p=>p.id===bucket.activeId),b=bucket.items.find(p=>p.id===state.dmaCompareB)||bucket.items.find(p=>p.id!==a.id)||a;
    const diffs=window.DMAPlans.differences(a.zones,b.zones),selected=diffs.find(d=>d.id===state.dmaCompareZone);
    const palette=['#2563eb','#0d9488','#9333ea','#d97706','#db2777','#0891b2'];
    const zoneColor=id=>palette[Math.max(0,diffs.findIndex(d=>d.id===id))%palette.length];
    const members=window.DMAPlans.members(selected?.old,selected?.now);
    const categories=[['common','共有','#2563eb'],['a','仅基准','#ea580c'],['b','仅对比','#a21caf']];
    const hidden=state.dmaCompareHidden||[];
    const option=p=>bucket.items.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
    let view=[0,0,900,540],points=[];
    for(const z of [selected?.old,selected?.now])if(z){const r=Object.create(topologyReadRenderer);r.s={...topologyReadRenderer.s,data:{...base,zones:[z]}};points.push(...r.zonePoints(z));}
    if(points.length){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(300,Math.max(...xs)-x+100),h=Math.max(230,Math.max(...ys)-y+100);view=[x-50,y-50,w,h];}
    const map=(plan,side)=>{
      const renderer=Object.create(topologyReadRenderer);renderer.s={...topologyReadRenderer.s,data:{...base,zones:plan.zones},selected:null,view};
      const wrapper=document.createElement('div');wrapper.innerHTML=renderer.map(true,{dma:true,points:false});
      const svg=wrapper.querySelector('svg');svg.setAttribute('viewBox',view.join(' '));
      wrapper.querySelectorAll('[data-action]').forEach(el=>{
        const id=el.dataset.value;
        if(el.classList.contains('we-zone')){
          el.dataset.action='dma-plan-focus';
          const color=zoneColor(id),focus=selected?.id===id;
          el.style.setProperty('fill',color,'important');el.style.setProperty('fill-opacity',selected?(focus?'.07':'.015'):'.18','important');
          el.style.setProperty('stroke',color,'important');el.style.setProperty('stroke-width',focus?'3':'1.5','important');
          el.style.pointerEvents='all';el.style.cursor='pointer';
          return;
        }
        el.removeAttribute('data-action');el.removeAttribute('role');el.removeAttribute('tabindex');el.style.pointerEvents='none';
        if(!selected)return;
        const kind=el.classList.contains('we-node')?'nodes':'pipes';
        const category=categories.find(([key])=>members[key][kind].includes(id));
        el.dataset.dmaCategory=category?.[0]||'context';
        const color=category?.[2]||'#94a3b8';
        el.style.opacity=category?(hidden.includes(category[0])?'0':'1'):'.15';
        el.style.setProperty('stroke',color,'important');
        if(kind==='pipes'){el.style.setProperty('stroke-width',category?'4':'1.5','important');if(category&&category[0]!=='common'&&category[0]!==side)el.style.strokeDasharray='6 4';}
        else el.querySelectorAll('circle,path,rect,text').forEach(child=>{child.style.setProperty('stroke',child.tagName==='text'?'none':color,'important');child.style.setProperty('fill',child.tagName==='text'?color:'#fff','important');});
      });
      return `<article class="product-map-compare-pane"><header><strong>${side==='a'?'基准':'对比'} · ${escapeHtml(plan.name)}</strong>${selected&&!plan.zones.some(z=>z.id===selected.id)?'<span>此方案无该分区</span>':''}</header><div class="product-map-compare-canvas">${wrapper.innerHTML}</div></article>`;
    };
    const legend=selected?categories.map(([key,label,color])=>`<button class="app-button" data-action="dma-plan-layer" data-value="${key}" aria-pressed="${!hidden.includes(key)}" style="opacity:${hidden.includes(key)?'.4':'1'}"><span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:3px"></span> ${label} · ${members[key].nodes.length} 点 / ${members[key].pipes.length} 线</button>`).join(''):diffs.map(d=>`<button class="app-button" data-action="dma-plan-focus" data-value="${escapeHtml(d.id)}"><span style="display:inline-block;width:12px;height:12px;background:${zoneColor(d.id)};border-radius:3px"></span> ${escapeHtml((d.now||d.old).name)}</button>`).join('');
    const M=window.WaterMapLayout,tableRows=diffs.map(d=>`<tr><td>${escapeHtml(d.id)}</td><td>${escapeHtml((d.now||d.old).name)}</td><td>${escapeHtml(!d.old?'新增':!d.now?'删除':d.changed?'修改':'无变化')}</td><td>${d.old?.nodeIds.length??'—'} / ${d.now?.nodeIds.length??'—'}</td><td>${d.old?.pipeIds.length??'—'} / ${d.now?.pipeIds.length??'—'}</td><td><button class="app-button app-button-link" data-action="dma-plan-focus" data-value="${escapeHtml(d.id)}">查看 / 定位</button></td></tr>`).join('');
    const problem=diffs.filter(d=>!d.old||!d.now||d.changed);
    const issueList=M.issues(problem.slice(0,5).map(d=>`<button class="product-list-row" data-action="dma-plan-focus" data-value="${escapeHtml(d.id)}"><span class="product-list-row-main"><strong>${escapeHtml((d.now||d.old).name)}</strong><small>${!d.old?'新增分区':!d.now?'删除分区':'成员或属性有变化'}</small></span></button>`).join(''),problem.length);
    const memberRows=selected?categories.flatMap(([key,label])=>[...members[key].nodes,...members[key].pipes].map(id=>{const o=[...base.nodes,...base.pipes].find(o=>o.id===id);return `<tr><td>${escapeHtml(id)}</td><td>${escapeHtml(o?.name||'—')}</td><td>${label}</td><td>${members[key].nodes.includes(id)?'节点':'管道'}</td></tr>`;})).join(''):'';
    return `<div class="map-compare-page"><header class="map-compare-controls"><strong>DMA 方案对比 · ${escapeHtml(state.selectedTopology)}</strong><label>基准方案<select class="app-select" id="dmaCompareA">${option(a)}</select></label><label>对比方案<select class="app-select" id="dmaCompareB">${option(b)}</select></label><button class="app-button" data-page="p08">拓扑版本对比</button><button class="app-button" data-page="p06">方案管理</button></header><div data-map-workspace="dma-compare"><section class="product-map-compare-shell" data-map-slot="canvas">${map(a,'a')}${map(b,'b')}</section>${M.left(`<label><input type="checkbox" data-map-layer=".we-pipe" checked>管道</label><label><input type="checkbox" data-map-layer=".we-node" checked>节点与设施</label><label><input type="checkbox" data-map-layer=".we-zone" checked>DMA 分区</label>${selected?legend:'<span>选择底部列表查看分区差异</span>'}`,issueList)}<div class="map-view-tools"><button class="app-button" data-map-view="in">＋</button><button class="app-button" data-map-view="out">−</button><button class="app-button" data-action="dma-plan-focus" data-value="">全图</button></div>${selected?`<aside data-map-slot="right" aria-label="详情表单"><header class="map-panel-head"><strong>分区属性对照</strong><button class="app-button" data-action="dma-plan-focus" data-value="">关闭</button></header><div class="we-form"><h3>${escapeHtml((selected.now||selected.old).name)}</h3><p>${escapeHtml(selected.id)}</p>${categories.map(([key,label])=>`<div class="we-property"><span>${label}</span><strong>${members[key].nodes.length} 点 / ${members[key].pipes.length} 线</strong></div>`).join('')}</div></aside>`:''}${M.bottom(`<nav class="map-object-tabs"><button data-map-ledger-tab="objects">分区列表</button>${selected?'<button data-map-ledger-tab="members">成员对象</button>':''}</nav><div data-map-ledger="objects"><table class="app-table"><thead><tr><th>分区编号</th><th>名称</th><th>变化</th><th>基准 / 对比点数</th><th>基准 / 对比管线数</th><th>操作</th></tr></thead><tbody>${tableRows||'<tr><td colspan="6">暂无分区</td></tr>'}</tbody></table></div>${selected?`<div data-map-ledger="members" hidden><table class="app-table"><thead><tr><th>对象编号</th><th>名称</th><th>成员归属</th><th>类型</th></tr></thead><tbody>${memberRows||'<tr><td colspan="4">无成员对象</td></tr>'}</tbody></table></div>`:''}`,'分区对象列表')}</div></div>`;

  }

  function renderLegacyP07() {
    return `<div class="product-page product-page-stack">${pageHeader("p07", `${tag(state.p07Step >= 2 ? "边界已计算" : "边界待更新", state.p07Step >= 2 ? "success" : "warning")}<button class="app-button" type="button" data-action="save-dma">保存</button><button class="app-button" type="button" data-action="validate-dma">校验</button><button class="app-button app-button-primary" type="button" data-action="recompute-boundary" ${state.p07Step < 1 ? "disabled" : ""}>重新计算边界</button>`)}
      ${state.p07Step === 0 ? '<div class="app-alert"><div><div class="app-alert-title">从创建一级分区开始</div><div class="app-alert-description">输入分区名称后使用多边形选择候选对象，再按空间选择规则固化 Selection Set。</div></div></div>' : state.p07Step === 1 ? '<div class="app-alert app-alert-warning"><div><div class="app-alert-title">成员已变化，边界状态 DIRTY</div><div class="app-alert-description">DMA-城南-03 仍有未分配管长 13.7 km，请保存成员后重新计算边界。</div></div></div>' : '<div class="app-alert app-alert-success"><div><div class="app-alert-title">边界连接已计算</div><div class="app-alert-description">识别 6 个 Boundary Connection，可生成虚拟流量计与虚拟压力点。</div></div></div>'}
      <div class="product-three-pane"><section class="product-pane"><div class="product-pane-header"><strong>分区树</strong><button class="app-button app-button-small app-button-primary" type="button" data-action="create-l1">新增一级分区</button></div><div><button class="product-list-row is-selected" type="button"><span class="product-list-row-main"><strong>▾ L1 城南分区</strong><small>管长 186.4 km · 1,283 Pipe</small></span></button><button class="product-list-row" type="button"><span class="product-list-row-main"><strong>　├ DMA-城南-01</strong><small>68.2 km</small></span></button><button class="product-list-row" type="button"><span class="product-list-row-main"><strong>　├ DMA-城南-02</strong><small>55.1 km</small></span></button><button class="product-list-row" type="button"><span class="product-list-row-main"><strong>　├ DMA-城南-03</strong><small>49.4 km</small></span></button><button class="product-list-row" type="button" data-action="unassigned"><span class="product-list-row-main"><strong>　└ 未分配</strong><small class="app-text-danger">13.7 km · 92 Pipe</small></span>${tag("需处理", "warning")}</button></div></section>
      <section class="product-pane product-pane-map">${networkMap({ dma: true, virtual: state.p07Step >= 3 })}<div class="app-gis-toolbar"><button class="app-button" type="button">新建分区面</button><button class="app-button" type="button">编辑分区面</button><button class="app-button" type="button">拆分分区面</button><button class="app-button" type="button">合并分区面</button><button class="app-button" type="button">增加成员</button><button class="app-button" type="button">移除成员</button></div></section>
      <aside class="product-pane"><div class="product-pane-header"><strong>L1 城南分区</strong>${tag("L1", "blue")}</div><div class="product-pane-body product-detail-stack"><div class="product-mini-stats"><button class="product-mini-stat product-kpi-button" type="button">Pipe<strong>1,283</strong></button><button class="product-mini-stat product-kpi-button" type="button">Node<strong>1,046</strong></button><button class="product-mini-stat product-kpi-button" type="button" data-action="boundary-detail">边界连接<strong>${state.p07Step >= 2 ? "6" : "待计算"}</strong></button><button class="product-mini-stat product-kpi-button" type="button" data-action="unassigned">未分配<strong class="app-text-danger">13.7 km</strong></button><div class="product-mini-stat">虚拟流量计<strong>${state.p07Step >= 3 ? "6" : "0"}</strong></div><div class="product-mini-stat">虚拟压力点<strong>${state.p07Step >= 3 ? "6" : "0"}</strong></div><div class="product-mini-stat">真实流量覆盖<strong>4 / 6</strong></div><button class="product-mini-stat product-kpi-button" type="button">流量监测缺口<strong class="app-text-danger">2</strong></button></div><button class="app-button app-button-primary" type="button" data-action="create-child">创建下一级</button><button class="app-button" type="button" data-action="generate-virtual" ${state.p07Step < 2 ? "disabled" : ""}>生成模拟设备</button><p class="app-text-tertiary">真实设备使用实心标记；Virtual Monitor 使用空心虚线标记。</p></div></aside></div></div>`;
  }

  function compareObjectProfile(id) {
    const suffix = Number((String(id).match(/(\d+)(?!.*\d)/) || [0, 1])[1]);
    const metric = (label, unit, baseline, current) => ({ label, unit, baseline, current, changed: baseline !== current });
    const attr = (label, baseline, current) => ({ label, baseline, current, changed: baseline !== current });
    if (String(id).startsWith("DMA-")) {
      const dma = findDma(id) || p02DmaCatalog[0];
      const leakage = Number.parseFloat(dma.leakage) || 5.5;
      const pressure = Number.parseFloat(dma.pressure) || .35;
      const outlet = Number.parseFloat(String(dma.outlet).replace(/,/g, "")) || 1214.7;
      return { id, name: dma.name, type: "DMA 分区", change: id === "DMA-B" ? "新增" : "属性变化", metrics: [metric("平均压力", "MPa", +(pressure - .018).toFixed(3), pressure), metric("出口瞬时流量", "m³/h", +(outlet * .94).toFixed(1), outlet), metric("漏损率", "%", +(leakage + 1.3).toFixed(1), leakage)], attrs: [attr("分区层级", `${dma.level}级`, `${dma.level}级`), attr("成员管线", `${264 + suffix} 根`, `${286 + suffix} 根`), attr("边界设备", "8 个", "6 个"), attr("水质覆盖", "2 / 3", "3 / 3")] };
    }
    if (String(id).startsWith("PIPE")) {
      const pipeNumber = suffix || 3;
      const properties = pipeRenderProperties(pipeNumber);
      const isAdded = pipeNumber === 6 || String(id).includes("021");
      const isRemoved = pipeNumber === 9;
      const diameterCurrent = properties.diameter;
      const diameterBaseline = isAdded ? null : pipeNumber === 3 ? Math.max(100, diameterCurrent - 100) : diameterCurrent;
      const lengthCurrent = +(260 + pipeNumber * 13.4).toFixed(1);
      const lengthBaseline = isAdded ? null : +(lengthCurrent - (pipeNumber === 3 ? 13 : 0)).toFixed(1);
      return { id, name: p02PipeCatalog.find(item => item.id === id)?.name || `管线 ${String(pipeNumber).padStart(3, "0")}`, type: "管线", change: isAdded ? "新增" : isRemoved ? "删除" : pipeNumber === 3 || pipeNumber === 16 ? "属性变化" : "未变化", metrics: [metric("管径", "DN", diameterBaseline, isRemoved ? null : diameterCurrent), metric("长度", "m", lengthBaseline, isRemoved ? null : lengthCurrent), metric("管龄", "年", isAdded ? null : properties.age + 1, isRemoved ? null : properties.age)], attrs: [attr("管材", isAdded ? "—" : properties.material, isRemoved ? "—" : properties.material), attr("起点 Node", isAdded ? "—" : `NODE-${String(pipeNumber).padStart(3, "0")}`, isRemoved ? "—" : `NODE-${String(pipeNumber).padStart(3, "0")}`), attr("终点 Node", isAdded ? "—" : `NODE-${String(pipeNumber + 1).padStart(3, "0")}`, isRemoved ? "—" : pipeNumber === 3 ? "NODE-008" : `NODE-${String(pipeNumber + 1).padStart(3, "0")}`), attr("运行状态", isAdded ? "—" : "在用", isRemoved ? "已拆除" : "在用")] };
    }
    const isValve = String(id).startsWith("VALVE");
    const isPlant = String(id).startsWith("PLANT");
    const isPump = String(id).startsWith("PUMP");
    const isUser = String(id).startsWith("USER");
    const type = isValve ? "阀门" : isPlant ? "水厂" : isPump ? "泵站" : isUser ? "用户端" : "连接节点";
    const name = isValve ? `控制阀 ${String(id).replace("VALVE-", "")}` : isPlant ? "第一水厂" : isPump ? "城西加压泵站" : isUser ? ({"USER-NORTH":"北区用户","USER-NORTHEAST":"东北用户","USER-SOUTHEAST":"东南用户","USER-SOUTH":"南区用户"}[id] || "用户端") : `连接点 ${String(id).replace("NODE-", "")}`;
    const coordinateX = +(120 + suffix * 3.8).toFixed(1);
    const coordinateY = +(86 + suffix * 1.7).toFixed(1);
    return { id, name, type, change: suffix === 2 || suffix === 301 ? "属性变化" : "未变化", metrics: [metric("X 坐标", "m", coordinateX, suffix === 2 ? +(coordinateX + 8.2).toFixed(1) : coordinateX), metric("Y 坐标", "m", coordinateY, coordinateY), metric(isValve ? "安装高程" : isPump ? "额定扬程" : "地面高程", "m", isPump ? 42 : +(18 + suffix / 10).toFixed(1), isPump ? 45 : +(18 + suffix / 10).toFixed(1))], attrs: [attr("对象类型", type, type), attr("所属 DMA", "DMA-A03", suffix === 2 ? "DMA-B07" : "DMA-A03"), attr(isValve ? "阀门状态" : "运行状态", "正常", "正常"), attr("关联管线", `${2 + suffix % 3} 条`, `${2 + suffix % 3} 条`)] };
  }

  function renderCompareAttributePanel(id) {
    const profile = compareObjectProfile(id);
    const numericValues = profile.metrics.flatMap(item => [item.baseline, item.current]).filter(value => typeof value === "number");
    const globalMax = Math.max(...numericValues, 1);
    const valueText = (value, unit) => value == null ? "—" : unit === "DN" ? `DN${value}` : `${value} ${unit}`;
    const metricRows = profile.metrics.map(item => {
      const localMax = Math.max(item.baseline || 0, item.current || 0, globalMax * .01);
      const position = value => value == null ? 0 : Math.max(5, Math.min(95, value / localMax * 92));
      const left = Math.min(position(item.baseline), position(item.current));
      const width = Math.abs(position(item.current) - position(item.baseline));
      return `<div class="product-attribute-compare-row"><div class="product-attribute-compare-values"><strong>${item.label}</strong><span><i class="is-baseline"></i>基准 ${valueText(item.label.includes("长度")?lengthText(item.baseline):item.baseline, item.unit)}</span><span><i class="is-current"></i>当前 ${valueText(item.label.includes("长度")?lengthText(item.current):item.current, item.unit)}</span></div><div class="product-attribute-compare-rail" aria-label="${item.label}基准与当前值对比">${item.baseline == null || item.current == null ? "" : `<b style="left:${left}%;width:${Math.max(width, 1)}%"></b>`}${item.baseline == null ? "" : `<i class="is-baseline" style="left:${position(item.baseline)}%"></i>`}${item.current == null ? "" : `<i class="is-current" style="left:${position(item.current)}%"></i>`}</div></div>`;
    }).join("");
    const allRows = [...profile.metrics.map(item => ({ label: item.label, baseline: valueText(item.label.includes("长度")?lengthText(item.baseline):item.baseline, item.unit), current: valueText(item.label.includes("长度")?lengthText(item.current):item.current, item.unit), changed: item.changed })), ...profile.attrs];
    const rows = state.p08AllFields ? allRows : allRows.filter(item => item.changed);
    const changeType = profile.change === "新增" ? "success" : profile.change === "删除" ? "error" : profile.change === "未变化" ? "" : "warning";
    return `<aside class="product-compare-attribute-panel" role="dialog" aria-label="${profile.id} 属性对比"><header><div><strong>${profile.id}</strong><span>${profile.name} · ${profile.type}</span></div><button class="app-button app-button-text app-button-icon" type="button" data-action="close-compare-object" aria-label="关闭属性对比">×</button></header><div class="product-compare-attribute-body"><div class="u-flex u-justify-between u-items-center"><strong>属性对比图</strong>${tag(profile.change, changeType)}</div><div class="product-attribute-compare-chart"><div class="product-attribute-compare-axis"><span>基准版本</span><span>当前版本</span></div>${metricRows}</div><div class="product-compare-attribute-heading"><strong>字段变化明细</strong><div class="u-flex u-gap-2"><button class="app-button app-button-small ${!state.p08AllFields ? "app-button-primary" : ""}" type="button" data-action="attr-mode" data-value="changed">仅变化</button><button class="app-button app-button-small ${state.p08AllFields ? "app-button-primary" : ""}" type="button" data-action="attr-mode" data-value="all">全部属性</button></div></div><div class="app-table-wrap"><table class="app-table"><thead><tr><th>属性</th><th>基准版本</th><th>当前版本</th><th>结果</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr><td><strong>${item.label}</strong></td><td>${item.baseline}</td><td>${item.current}</td><td>${item.changed ? tag("变化", "warning") : "未变化"}</td></tr>`).join("") : '<tr><td colspan="4"><div class="app-empty"><div><div class="app-empty-mark"></div>该对象无属性变化</div></div></td></tr>'}</tbody></table></div></div></aside>`;
  }

  function compareSnapshot(id) {
    const previous=state.selectedTopology;
    try { state.selectedTopology=id; return JSON.parse(JSON.stringify(topologyEditor().s.saved)); }
    finally { state.selectedTopology=previous;topologyEditor(); }
  }
  function renderVersionComparison(summary=false) {
    const versions=topologyStore().versions;
    if(!versions.some(v=>v.id===state.compareBaseline))state.compareBaseline=topologyStore().comparisonBaseline||versions.find(v=>v.id!==state.selectedTopology)?.id||state.selectedTopology;
    const before=compareSnapshot(state.compareBaseline),after=topologyReadRenderer.s.data;
    const rows=[],allRows=[];
    const names={id:'对象编号',type:'对象类型',name:'名称',x:'X 坐标',y:'Y 坐标',elevation:'高程（m）',diameter:'管径（mm）',start:'上游节点',end:'下游节点',a:'起点坐标',b:'终点坐标',length:'管长（m）',material:'材质',startElevation:'起点高程（m）',endElevation:'终点高程（m）',parent:'上级分区',nodeIds:'成员点',pipeIds:'成员管线',devices:'设备集合',rule:'处理规则',metric:'数据类型',host:'挂接对象',age:'管龄（年）'};
    const fieldName=k=>names[k]||k;
    const enumNames={node:'连接节点',cap:'堵头',user:'用户端',valve:'阀门',pump:'泵站',plant:'水厂',pipe:'管线',zone:'DMA 分区',sum:'加和',average:'平均',flow:'流量',pressure:'压力',quality:'余氯',level:'水位'};
    const same=(k,a,b)=>JSON.stringify(['nodeIds','pipeIds','devices'].includes(k)&&Array.isArray(a)?[...a].sort():a)===JSON.stringify(['nodeIds','pipeIds','devices'].includes(k)&&Array.isArray(b)?[...b].sort():b);
    for(const [key,label] of [["nodes","点"],["pipes","管线"],["zones","DMA 分区"]]){
      const a=new Map(before[key].map(o=>[o.id,o])),b=new Map(after[key].map(o=>[o.id,o]));
      for(const id of new Set([...a.keys(),...b.keys()])){
        const old=a.get(id),now=b.get(id);
        const fields=[...new Set([...Object.keys(old||{}),...Object.keys(now||{})])].filter(k=>!same(k,old?.[k],now?.[k]));
        const row={id,label,old,now,fields,change:!old?"新增":!now?"删除":fields.length?"修改":"未变化"};
        allRows.push(row);if(fields.length)rows.push(row);
      }
    }
    const bindingRows=version=>new Map(topologyStore().bindings.filter(b=>b.key.split('|')[0]===version).map(b=>{const [,host,metric]=b.key.split('|');return [host+'|'+metric,{host,metric,devices:[...b.devices].sort(),rule:b.rule}];}));
    const oldBindings=bindingRows(state.compareBaseline),newBindings=bindingRows(state.selectedTopology);
    const bindingDiffs=[...new Set([...oldBindings.keys(),...newBindings.keys()])].map(key=>{
      const old=oldBindings.get(key),now=newBindings.get(key),fields=['host','metric','devices','rule'].filter(k=>!same(k,old?.[k],now?.[k]));
      return {id:'binding:'+key,host:(now||old).host,label:'设备挂接',old,now,fields,change:!old?'新增':!now?'删除':fields.length?'修改':'未变化'};
    }).filter(r=>r.fields.length);
    const selected=[...allRows,...bindingDiffs].find(r=>r.id===state.p08Selected),selectedId=selected?.host||state.p08Selected;
    const viewPoints=[];
    if(selectedId)for(const data of [before,after]){
      const renderer=Object.create(topologyReadRenderer);renderer.s={...topologyReadRenderer.s,data};
      const o=[...data.nodes,...data.pipes,...data.zones].find(o=>o.id===selectedId);
      if(o)viewPoints.push(...(o.type==='pipe'?renderer.coords(o):o.type==='zone'?renderer.zonePoints(o):[o]));
    }
    let sharedView=[0,0,900,540];
    if(viewPoints.length){const xs=viewPoints.map(p=>p.x),ys=viewPoints.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),w=Math.max(300,maxX-minX+160),h=Math.max(230,maxY-minY+130);sharedView=[(minX+maxX-w)/2,(minY+maxY-h)/2,w,h];}
    const options=id=>versions.map(v=>`<option value="${escapeHtml(v.id)}" ${v.id===id?"selected":""}>${escapeHtml(v.id+" · "+v.name)}</option>`).join("");
    const controls=`<section class="app-search-panel"><div class="product-compare-controls"><label>基准版本<select class="app-select" id="actualCompareBaseline">${options(state.compareBaseline)}</select></label><label>当前版本<select class="app-select" id="actualCompareCurrent">${options(state.selectedTopology)}</select></label></div></section>`;
    const stats=`<section class="product-stat-strip">${[["点",before.nodes.length,after.nodes.length],["管线",before.pipes.length,after.pipes.length],["DMA 分区",before.zones.length,after.zones.length],["设备挂接组",... [state.compareBaseline,state.selectedTopology].map(id=>topologyStore().bindings.filter(b=>b.key.split("|")[0]===id).length)]].map(([label,a,b])=>`<div class="app-kpi-card"><div class="app-statistic-label">${label}</div><div class="app-statistic-value">${a} → ${b}</div></div>`).join("")}</section>`;
    const map=(data,id)=>{
      const renderer=Object.create(topologyReadRenderer);
      renderer.s={...topologyReadRenderer.s,data,selected:null,view:[0,0,900,540]};
      const wrapper=document.createElement("div");wrapper.innerHTML=renderer.map(true,{dma:true,points:false,selectedIds:selectedId?[selectedId]:[]});
      wrapper.querySelectorAll("[data-action]").forEach(el=>{
        el.dataset.action="actual-compare-object";
        if(el.classList.contains('we-node'))el.style.setProperty('pointer-events','bounding-box','important');
        const row=rows.find(r=>r.id===el.dataset.value);
        if(row)el.classList.add(row.change==='新增'?'cmp-added':row.change==='删除'?'cmp-removed':'cmp-changed');
        if(el.dataset.value===selectedId)el.classList.add('cmp-selected');
      });
      const exists=[...data.nodes,...data.pipes,...data.zones].some(o=>o.id===selectedId);
      wrapper.querySelector('svg').setAttribute('viewBox',sharedView.join(' '));
      return `<article class="product-map-compare-pane"><header><strong>${escapeHtml(id)}</strong><span>${selectedId&&!exists?'本版本无此对象':''}</span></header><div class="product-map-compare-canvas">${wrapper.innerHTML}</div></article>`;
    };
    const format=(v,k)=>v===undefined||v===null||v===''?'—':escapeHtml(k==='length'?lengthText(v):Array.isArray(v)?v.join('、'):typeof v==='object'?`X：${v.x}，Y：${v.y}`:['type','rule','metric'].includes(k)?enumNames[v]||v:String(v));
    const detail=selected?`<section class="app-card"><div class="app-card-header"><h2 class="app-card-title">${escapeHtml(selected.host||selected.id)} · ${selected.change} · 属性对照</h2></div><table class="app-table"><thead><tr><th>字段</th><th>基准值</th><th>当前值</th></tr></thead><tbody>${[...new Set([...Object.keys(selected.old||{}),...Object.keys(selected.now||{})])].map(k=>`<tr><td>${escapeHtml(fieldName(k))}${selected.fields.includes(k)?" · 变化":""}</td><td>${format(selected.old?.[k],k)}</td><td>${format(selected.now?.[k],k)}</td></tr>`).join("")}</tbody></table></section>`:"";
    const bindingTable=`<section class="app-card"><div class="app-card-header"><h2 class="app-card-title">挂接差异 · ${bindingDiffs.length}</h2></div><table class="app-table"><thead><tr><th>挂接对象</th><th>数据类型</th><th>变化</th><th>字段</th><th>操作</th></tr></thead><tbody>${bindingDiffs.map(r=>`<tr><td>${escapeHtml(r.host)}</td><td>${format((r.now||r.old).metric,'metric')}</td><td>${r.change}</td><td>${r.fields.map(fieldName).join('、')}</td><td><button class="app-button app-button-link" data-action="actual-compare-object" data-value="${escapeHtml(r.id)}">查看</button></td></tr>`).join('')||'<tr><td colspan="5">无挂接配置差异</td></tr>'}</tbody></table></section>`;
    if(!summary){
      const M=window.WaterMapLayout,objectRows=`<div class="map-table-scroll"><table class="app-table"><thead><tr><th>对象编号</th><th>类型</th><th>变化</th><th>变化字段</th><th>操作</th></tr></thead><tbody>${allRows.map(r=>`<tr><td>${escapeHtml(r.id)}</td><td>${r.label}</td><td>${r.change}</td><td>${escapeHtml(r.fields.map(fieldName).join('、'))||'—'}</td><td><button class="app-button app-button-link" data-action="actual-compare-object" data-value="${escapeHtml(r.id)}">查看 / 定位</button></td></tr>`).join('')}</tbody></table></div>`;
      const layers=`<label><input type="checkbox" data-map-layer=".we-pipe" checked>管道</label><label><input type="checkbox" data-map-layer=".we-node" checked>节点与设施</label><label><input type="checkbox" data-map-layer=".we-zone" checked>DMA 分区</label><div class="map-change-legend"><span>● 新增</span><span>┄ 删除</span><span>● 修改</span></div>`;
      const problem=M.issues(rows.slice(0,5).map(r=>`<button class="product-list-row" data-action="actual-compare-object" data-value="${escapeHtml(r.id)}"><span class="product-list-row-main"><strong>${escapeHtml(r.id)}</strong><small>${r.change} · ${escapeHtml(r.fields.map(fieldName).join('、'))}</small></span></button>`).join(''),rows.length);
      return `<div class="map-compare-page"><header class="map-compare-controls"><strong>拓扑版本对比</strong>${controls}<button class="app-button" data-page="p06compare">DMA 方案对比</button><button class="app-button" data-page="p09">数据总览</button></header><div data-map-workspace="topology-compare"><section class="product-map-compare-shell" data-map-slot="canvas">${map(before,state.compareBaseline)}${map(after,state.selectedTopology)}</section>${M.left(layers,problem)}<div class="map-view-tools"><button class="app-button" data-map-view="in">＋</button><button class="app-button" data-map-view="out">−</button><button class="app-button" data-action="actual-compare-reset">全图</button></div>${selected?`<aside data-map-slot="right" aria-label="详情表单"><header class="map-panel-head"><strong>属性对照</strong><button class="app-button" data-action="actual-compare-reset">关闭</button></header>${detail}</aside>`:''}${M.bottom(`<nav class="map-object-tabs"><button data-map-ledger-tab="objects">拓扑对象 · ${allRows.length}</button><button data-map-ledger-tab="bindings">挂接差异 · ${bindingDiffs.length}</button></nav><div data-map-ledger="objects">${objectRows}</div><div data-map-ledger="bindings" hidden>${bindingTable}</div>`,'对象对比列表')}</div></div>`;
    }
    return `<div class="product-page product-page-stack"><style>.cmp-added,.cmp-added path,.cmp-added circle{stroke:#15803d!important}.cmp-removed,.cmp-removed path,.cmp-removed circle{stroke:#dc2626!important;stroke-dasharray:5 3}.cmp-changed,.cmp-changed path,.cmp-changed circle{stroke:#d97706!important}.cmp-selected{filter:drop-shadow(0 0 3px #2563eb);stroke-width:5!important}.product-map-compare-canvas svg{width:100%;height:100%}</style>${pageHeader(summary?"p09":"p08",`<button class="app-button" data-page="${summary?"p08":"p09"}">${summary?"地图对比":"数据总览"}</button>`)}${controls}${stats}<div class="u-flex u-gap-2"><span style="color:#15803d">● 新增</span><span style="color:#dc2626">┄ 删除</span><span style="color:#d97706">● 修改</span><span>未标色：未变化</span><button class="app-button" data-action="actual-compare-reset">全图</button></div>${summary?"":`<section class="product-map-compare-shell">${map(before,state.compareBaseline)}${map(after,state.selectedTopology)}</section>`}${detail}${bindingTable}<section class="app-card"><div class="app-card-header"><h2 class="app-card-title">对象差异 · ${rows.length}</h2></div><div class="app-table-wrap"><table class="app-table"><thead><tr><th>对象编号</th><th>类型</th><th>变化</th><th>变化字段</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.id)}</td><td>${r.label}</td><td>${r.change}</td><td>${escapeHtml(r.fields.map(fieldName).join("、"))}</td><td><button class="app-button app-button-link" data-action="actual-compare-object" data-value="${escapeHtml(r.id)}">查看</button></td></tr>`).join("")||'<tr><td colspan="5">无对象差异</td></tr>'}</tbody></table></div></section></div>`;
  }
  function renderP08() { return renderVersionComparison(); }
  function renderP09() { return renderVersionComparison(true); }

  function renderP10Left() {
    const row = (key, label, count = "", configurable = true) => renderLayerRow("scada", state.p10Layers, key, label, count, configurable);
    return `<div class="product-panel-section"><strong>监测底图</strong>${row("basemap", "基础底图", "", false)}${row("pipes", "管网骨架", "1,286 km", false)}</div><div class="product-panel-section"><strong>实时监测</strong>${row("pressure", "压力", "86")}${row("flow", "流量", "42")}${row("quality", "水质", "18")}${row("level", "水位", "12")}${row("noise", "噪声仪", "")}${row("hydrants", "消火栓", "")}</div><div class="product-panel-section"><strong>监测标注</strong>${row("labels", "监测值与状态")}</div>`;
  }

  function renderP10Bottom() {
    const tabs = [["users", "用户用水"], ["pressure", "压力"], ["flow", "流量"], ["quality", "水质"], ["level", "水位"], ["noise", "噪声仪"]];
    const keyword = state.p10Query.trim().toLowerCase();
    const statusOf = item => item.alarm ? "报警" : item.quality === "DELAYED" ? "数据异常" : item.quality === "WARNING" ? "预警" : "正常";
    let monitors = p02MonitorCatalog.filter(item => item.type === state.p10BottomTab && (!keyword || [item.id, item.name, item.location, item.value].some(value => value.toLowerCase().includes(keyword)))).map(item => ({ ...item, _status: statusOf(item) }));
    if (state.p10Status !== "all") monitors = monitors.filter(item => item._status === state.p10Status);
    monitors.sort((a, b) => state.p10Sort === "id" ? a.id.localeCompare(b.id) : a._status.localeCompare(b._status, "zh-CN"));
    const users=(topologyReadModel?.data.nodes||[]).filter(o=>window.WaterUserHierarchy?.eligible(o)&&(!keyword||[o.id,o.name].some(v=>v.toLowerCase().includes(keyword))));
    const userRows=`<table class="app-table"><thead><tr><th>用户编号</th><th>用户名称</th><th>子用户数</th><th>楼栋设备数</th><th>操作</th></tr></thead><tbody>${users.map(o=>{const n=window.WaterUserHierarchy.summary(topologyReadModel.data,o.id);return `<tr><td>${escapeHtml(o.id)}</td><td>${escapeHtml(o.name)}</td><td>${n.children}</td><td>${n.devices}</td><td><button class="app-button app-button-link" data-action="open-user-monitor" data-value="${escapeHtml(o.id)}">查看用水监测</button></td></tr>`;}).join('')}</tbody></table>`;
    const rows = state.p10BottomTab==='users'?userRows:monitors.length ? `<table class="app-table"><thead><tr><th>监测点</th><th>名称</th><th>当前值</th><th>数据时间</th><th>质量码</th><th>状态</th></tr></thead><tbody>${monitors.map(item => `<tr class="product-clickable-row" data-action="select-monitor" data-value="${item.id}" tabindex="0" role="button" aria-label="定位监测点 ${item.id}"><td><strong>${item.id}</strong></td><td>${item.name}</td><td>${item.value}</td><td>14:32:18</td><td>${item.quality}</td><td>${tag(item._status, item._status === "正常" ? "success" : item._status === "报警" ? "error" : "warning")}</td></tr>`).join("")}</tbody></table>` : bottomEmpty();
    return `<section data-user-ledger="${state.p10BottomTab==='users'}" class="app-gis-bottom product-gis-bottom product-object-drawer ${state.p10BottomOpen ? "" : "is-collapsed"} ${state.p10BottomPageSize === 20 ? "is-page-size-20" : "is-page-size-10"}"><div class="app-gis-bottom-header product-bottom-drawer-header"><div><strong>SCADA 监测对象</strong><span class="app-text-tertiary">查询、筛选与排序</span></div><button class="app-button app-button-text app-button-icon" type="button" data-action="toggle-p10-bottom" aria-label="${state.p10BottomOpen ? "收起监测对象抽屉" : "展开监测对象抽屉"}">${state.p10BottomOpen ? "⌄" : "⌃"}</button></div>${state.p10BottomOpen ? `<div class="product-bottom-tabs">${tabs.map(tabItem => `<button class="product-bottom-tab ${state.p10BottomTab === tabItem[0] ? "is-active" : ""}" type="button" data-action="p10-bottom-tab" data-value="${tabItem[0]}">${tabItem[1]}</button>`).join("")}</div><div class="product-bottom-filterbar"><input id="p10SearchInput" class="app-input" value="${escapeHtml(state.p10Query)}" placeholder="${state.p10BottomTab==='users'?'查询用户编号或名称':'查询监测点、名称或当前值'}" /><div class="product-bottom-status-filter">${[["all", "全部"], ["正常", "正常"], ["预警", "预警"], ["报警", "报警"], ["数据异常", "数据异常"]].map(item => `<button class="app-button app-button-small ${state.p10Status === item[0] ? "app-button-primary" : ""}" type="button" data-action="p10-status" data-value="${item[0]}">${item[1]}</button>`).join("")}</div><select class="app-select" data-p10-bottom-sort><option value="status" ${state.p10Sort === "status" ? "selected" : ""}>按状态排序</option><option value="id" ${state.p10Sort === "id" ? "selected" : ""}>按编号排序</option></select><button class="app-button app-button-primary" type="button" data-action="p10-search">查询</button><button class="app-button" type="button" data-action="p10-reset">重置</button></div><div class="app-gis-bottom-body product-bottom-drawer-body">${rows}</div>` : ""}</section>`;
  }

  function renderP10() {
    const user=topologyReadModel?.objects.get(state.p10UserSelected);
    const userDrawer=window.WaterUserHierarchy?.eligible(user);
    const monitor = p02MonitorCatalog.find(item => item.id === state.p10Selected) || p02MonitorCatalog.find(item => item.id === "P-032");
    if(!monitor&&!userDrawer)state.p10Drawer=false;
    const typeLabel = { pressure: "压力", flow: "流量", quality: "水质", level: "水位", noise:"噪声" }[monitor?.type];
    const presentation = mapStylePresentation("scada", state.p10Zoom, state.p10Layers);
    const mapClasses = `${state.p10Layers.basemap ? "" : " is-basemap-hidden"} product-map-view-scada ${presentation.className}`;
    return `<div class="product-page product-page-gis"><div class="product-gis-frame ${state.p10Drawer||userDrawer?"has-detail":""} ${state.p10LayerOpen ? "" : "is-left-collapsed"}"><div class="product-gis-contextbar"><span class="product-gis-title">SCADA 监测一张图</span><span class="app-text-secondary">${escapeHtml(activeProject().name)}</span><span class="product-current-data-scope">${tag("最新有效数据", "success")}</span><div class="product-gis-contextbar-actions"><button class="app-button" type="button" data-page="p10h">查看历史记录</button><button class="app-button" type="button" data-action="toggle-p10-bottom">监测对象列表</button><button class="app-button" data-action="show-user-monitors">用户用水</button></div></div><div class="product-gis-map${mapClasses}" style="${presentation.style}">${networkMap({ points: true, quality: true, level: true, layers: state.p10Layers, classificationContext: "scada" })}</div>
      ${state.p10LayerOpen ? `<aside class="app-gis-panel product-gis-panel product-gis-panel-left"><div class="app-gis-panel-header"><strong>SCADA 图层</strong><button class="app-button app-button-text app-button-icon" type="button" data-action="toggle-layer-drawer" aria-label="收起图层抽屉">‹</button></div><div class="app-gis-panel-body">${renderP10Left()}</div></aside>` : `<button class="product-layer-drawer-trigger" type="button" data-action="toggle-layer-drawer" aria-label="展开图层抽屉">图层</button>`}
      <div class="app-gis-toolbar product-gis-toolbar" aria-label="地图查看工具"><button class="app-button app-button-icon product-map-tool-button" type="button" data-action="map-view" data-value="reset" data-tooltip="复位地图" title="复位地图" aria-label="复位地图">${mapToolIcon("extent")}</button><button class="app-button app-button-icon product-map-tool-button" type="button" data-action="map-view" data-value="zoom-in" data-tooltip="放大地图" title="放大地图" aria-label="放大地图">${mapToolIcon("zoomIn")}</button><button class="app-button app-button-icon product-map-tool-button" type="button" data-action="map-view" data-value="zoom-out" data-tooltip="缩小地图" title="缩小地图" aria-label="缩小地图">${mapToolIcon("zoomOut")}</button><span class="product-map-zoom-label">L${presentation.level} · ${state.p10Zoom}%</span></div>
      ${renderPipeClassificationLegend("scada", state.p10Layers)}
${state.layerStyleEditor?.context==="scada"?`<aside class="app-gis-panel product-gis-panel product-gis-panel-right" aria-label="图层样式设置">${renderLayerStyleEditor("scada",state.layerStyleEditor.layer)}</aside>`:userDrawer?`<aside class="app-gis-panel product-gis-panel product-gis-panel-right"><div class="app-gis-panel-header"><strong>${escapeHtml(user.name)} · 用户用水监测</strong><button class="app-button" data-action="close-p10-detail">关闭</button></div><div class="app-gis-panel-body product-detail-stack">${window.WaterUserHierarchy.render(topologyReadModel.data,user.id,'monitor')}</div></aside>`:state.p10Drawer?`      <aside class="app-gis-panel product-gis-panel product-gis-panel-right"><div class="app-gis-panel-header"><div><strong>${monitor.id} ${monitor.name}</strong><div class="app-text-tertiary">${typeLabel} · 最新监测</div></div><button class="app-button" data-action="close-p10-detail">关闭</button></div><div class="app-gis-panel-body product-detail-stack"><div class="u-flex u-justify-between">${tag(monitor.alarm ? "报警" : "在线", monitor.alarm ? "error" : "success")}${tag(monitor.quality, monitor.quality === "GOOD" ? "success" : "warning")}</div><div class="product-drawer-kpi ${monitor.alarm ? "is-warning" : ""}"><div class="app-statistic-label">当前值</div><div class="app-statistic-value">${monitor.value}</div><div class="app-statistic-meta">数据时间 14:32:18</div></div><div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">监测类型</div><div class="app-description-value">${typeLabel}</div></div><div class="app-description-item"><div class="app-description-label">挂接位置</div><div class="app-description-value">${monitor.location}</div></div><div class="app-description-item"><div class="app-description-label">所属项目</div><div class="app-description-value">${escapeHtml(activeProject().name)}</div></div><div class="app-description-item"><div class="app-description-label">质量码</div><div class="app-description-value">${monitor.quality}</div></div></div>${monitor.devices?.length?monitor.devices.map(id=>`<button class="app-button" data-action="standard-device-data" data-value="${escapeHtml(id)}">${escapeHtml(id)} · 查看数据</button>`).join(''):trend(monitor.alarm ? "is-warning" : "")}<button class="app-button app-button-primary" type="button" data-action="open-monitor-trend" data-value="${escapeHtml(monitor.id)}">查看完整趋势</button></div></aside>`:''}${renderP10Bottom()}</div></div>`;
  }

  let monitorHistoryUI;
  function monitorHistoryContext(){
    const ui=deviceBinding(),key='water-monitor-history:'+state.activeProjectId,raw=localStorage.getItem(key);
    const result=window.MonitoringHistory.supplement(raw?JSON.parse(raw):null,state.selectedTopology,topologyReadModel.monitors,ui.devices,Date.now(),!topologyReadModel.data.sourceDataset);
    if(result.changed)localStorage.setItem(key,JSON.stringify(result.archive));
    if(result.devicesChanged){ui.devices.splice(0,ui.devices.length,...result.devices);ui.persist();}
    return {project:state.activeProjectId,version:state.selectedTopology,model:topologyReadModel,devices:ui.devices,archive:result.archive,selected:state.trendMonitor,refresh:render,select(id){state.trendMonitor=id;render();},chart:echartLineMarkup};
  }
  function renderP11(){if(!monitorHistoryUI)monitorHistoryUI=window.createMonitoringHistoryUI(monitorHistoryContext);return monitorHistoryUI.render();}

  function renderP12() {
    if (state.p12Mode === "binding") return renderBindingWorkspace();
    return `<div class="product-page product-page-stack">${pageHeader("p12", '<button class="app-button" type="button">查看挂接历史</button>')}<section class="app-search-panel"><div class="app-search-grid"><label class="app-form-item"><span class="app-form-label">设备</span><input class="app-input" placeholder="编号或名称" /></label><label class="app-form-item"><span class="app-form-label">类型</span><select class="app-select"><option>全部</option><option>压力</option><option>流量</option></select></label><label class="app-form-item"><span class="app-form-label">挂接状态</span><select class="app-select"><option>全部</option><option>待挂接</option><option>疑似</option><option>人工指定</option></select></label><div class="app-search-actions"><button class="app-button app-button-primary" type="button">查询</button><button class="app-button" type="button">重置</button></div></div></section><div class="app-alert app-alert-warning"><div><div class="app-alert-title">当前拓扑存在 3 个待处理挂接</div><div class="app-alert-description">重新挂接会结束旧 Binding 有效期并创建新记录，不覆盖历史映射。</div></div></div><div class="app-table-wrap"><table class="app-table"><thead><tr><th>设备</th><th>类型</th><th>Asset</th><th>当前拓扑对象</th><th>状态</th><th>候选</th><th>更新时间</th><th>操作</th></tr></thead><tbody><tr><td><strong>P018 城南压力点</strong></td><td>压力</td><td>NODE-A077</td><td>-</td><td>${state.p12Bound ? tag("人工指定", "blue") : tag("待挂接", "error")}</td><td>${state.p12Bound ? "-" : "3"}</td><td>2026-09-01 14:20</td><td><button class="app-button app-button-link" type="button" data-action="open-binding">${state.p12Bound ? "查看绑定" : "处理挂接"}</button></td></tr><tr><td><strong>FT-018 城东流量计</strong></td><td>流量</td><td>PIPE-A018</td><td>PIPE-2026-018</td><td>${tag("疑似", "warning")}</td><td>2</td><td>2026-09-01 13:48</td><td><button class="app-button app-button-link" type="button" data-action="open-binding">复核</button></td></tr><tr><td><strong>Q-006 一水厂出水</strong></td><td>水质</td><td>FACILITY-001</td><td>FACILITY-001</td><td>${tag("正常", "success")}</td><td>-</td><td>2026-09-01 14:31</td><td><button class="app-button app-button-link" type="button">历史</button></td></tr></tbody></table></div></div>`;
  }

  function renderBindingWorkspace() {
    return `<div class="product-page product-page-stack">${pageHeader("p12", '<button class="app-button" type="button" data-action="binding-back">返回列表</button>')}<div class="product-binding-shell"><aside class="product-binding-device"><h2 class="app-section-title">待挂接设备</h2><div class="u-mt-4 product-detail-stack"><div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">设备</div><div class="app-description-value">P018</div></div><div class="app-description-item"><div class="app-description-label">类型</div><div class="app-description-value">压力</div></div><div class="app-description-item"><div class="app-description-label">原 Asset</div><div class="app-description-value">NODE-A077</div></div><div class="app-description-item"><div class="app-description-label">状态</div><div class="app-description-value">${tag("UNMATCHED", "error")}</div></div></div><div class="app-alert"><div><div class="app-alert-title">原位置已定位</div><div class="app-alert-description">系统按距离、对象类型、Asset 历史和拓扑关系生成候选。</div></div></div></div></aside><section class="product-binding-map">${networkMap({ points: false })}<button class="product-map-point product-point-c is-error" type="button">设备原位置</button>${state.p12Candidate ? '<button class="product-map-point product-point-b" type="button">NODE-B103</button>' : ""}</section><aside class="product-binding-candidates"><div class="u-flex u-justify-between u-items-center"><h2 class="app-section-title">候选对象</h2><span class="app-text-tertiary">3 个</span></div><div class="u-mt-4"><button class="product-candidate ${state.p12Candidate === "NODE-B103" ? "is-selected" : ""}" type="button" data-action="select-candidate" data-value="NODE-B103"><strong>NODE-B103</strong><div class="product-candidate-meta"><span>压力节点 · 距离 3.8 m</span><span>匹配度 96%</span></div></button><button class="product-candidate ${state.p12Candidate === "NODE-B118" ? "is-selected" : ""}" type="button" data-action="select-candidate" data-value="NODE-B118"><strong>NODE-B118</strong><div class="product-candidate-meta"><span>压力节点 · 距离 8.6 m</span><span>匹配度 82%</span></div></button><button class="product-candidate ${state.p12Candidate === "PIPE-B067" ? "is-selected" : ""}" type="button" data-action="select-candidate" data-value="PIPE-B067"><strong>PIPE-B067</strong><div class="product-candidate-meta"><span>对象类型不匹配</span><span>不可选择</span></div></button></div>${state.p12Candidate ? `<div class="app-alert app-alert-success u-mt-4"><div><div class="app-alert-title">绑定预览</div><div class="app-alert-description">设备 P018 · 原 Asset NODE-A077 · 新选择 ${state.p12Candidate}</div></div></div><button class="app-button app-button-primary u-w-full u-mt-4" type="button" data-action="confirm-binding">确认新绑定</button>` : '<div class="app-empty"><div><div class="app-empty-mark"></div>请选择候选 Node 预览绑定</div></div>'}</aside></div></div>`;
  }

  function renderP13Current() {
    const statusText = {NEW:"待确认",ACKNOWLEDGED:"已确认",PROCESSING:"处理中"}[state.p13Status];
    const statusType = state.p13Status === "NEW" ? "error" : state.p13Status === "ACKNOWLEDGED" ? "warning" : "blue";
    return `<div class="product-page product-page-stack">${pageHeader("p13", '<button class="app-button" type="button">导出</button>')}<section class="app-search-panel"><div class="app-search-grid"><label class="app-form-item"><span class="app-form-label">时间范围</span><select class="app-select"><option>近 24 小时</option></select></label><label class="app-form-item"><span class="app-form-label">等级</span><select class="app-select"><option>全部</option><option>严重</option><option>重要</option></select></label><label class="app-form-item"><span class="app-form-label">状态</span><select class="app-select"><option>活动事件</option><option>待确认</option><option>处理中</option></select></label><label class="app-form-item"><span class="app-form-label">DMA</span><select class="app-select"><option>全部</option><option>DMA-城南-03</option></select></label><div class="app-search-actions"><button class="app-button app-button-primary" type="button">查询</button><button class="app-button" type="button">重置</button></div></div></section><div class="app-table-wrap"><table class="app-table"><thead><tr><th>时间</th><th>设备</th><th>指标</th><th>当前值</th><th>阈值</th><th>等级</th><th>DMA</th><th>持续</th><th>状态</th></tr></thead><tbody><tr class="${state.p13Selected ? "is-selected" : ""}" data-action="open-alarm"><td>2026-09-01 14:04:12</td><td><button class="app-button app-button-link" type="button" data-action="open-alarm">P-032</button></td><td>低压</td><td class="app-text-danger">0.182 MPa</td><td>&lt; 0.20 MPa</td><td>${tag("严重", "error")}</td><td>DMA-城南-03</td><td>28 分钟</td><td>${tag(statusText, statusType)}</td></tr><tr><td>2026-09-01 13:58:06</td><td>FT-018</td><td>数据延迟</td><td>286 m³/h</td><td>&gt; 10 min</td><td>${tag("重要", "warning")}</td><td>DMA-城东-02</td><td>14 分钟</td><td>${tag("处理中", "blue")}</td></tr><tr><td>2026-09-01 13:36:21</td><td>Q-009</td><td>余氯偏低</td><td>0.18 mg/L</td><td>&lt; 0.20</td><td>${tag("一般")}</td><td>DMA-城西-01</td><td>已恢复</td><td>${tag("已恢复", "success")}</td></tr></tbody></table></div>${state.p13Selected ? `<section class="app-card"><div class="app-card-header"><div><h2 class="app-card-title">P-032 低压报警详情</h2><span class="app-text-tertiary">ALARM-20260901-018</span></div><button class="app-button app-button-text app-button-icon" type="button" data-action="close-alarm">×</button></div><div class="app-card-body app-grid app-grid-2"><div class="product-detail-stack"><div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">报警值</div><div class="app-description-value app-text-danger">0.182 MPa</div></div><div class="app-description-item"><div class="app-description-label">阈值</div><div class="app-description-value">&lt; 0.20 MPa</div></div><div class="app-description-item"><div class="app-description-label">持续时间</div><div class="app-description-value">28 分钟</div></div><div class="app-description-item"><div class="app-description-label">处理状态</div><div class="app-description-value">${tag(statusText, statusType)}</div></div></div><div class="u-flex u-gap-2"><button class="app-button app-button-primary" type="button" data-action="alarm-ack" ${state.p13Status !== "NEW" ? "disabled" : ""}>确认报警</button><button class="app-button" type="button" data-action="alarm-process" ${state.p13Status !== "ACKNOWLEDGED" ? "disabled" : ""}>开始处理</button><button class="app-button" type="button" data-page="p02">GIS 定位</button></div></div><div>${trend("is-warning")}</div></div></section>` : ""}</div>`;
  }

  function renderP13() {
    return renderP13Current().replace("近 24 小时", "今日").replaceAll("2026-09-01", "2026-09-08");
  }

  function renderP14() {
    const ui=deviceBinding(),groups=topologyStore().bindings.filter(b=>b.key.split("|")[0]===state.selectedTopology);
    const devices=ui.devices.filter(d=>groups.some(b=>b.devices.includes(d.id)));
    return `<div class="product-page product-page-stack">${pageHeader("p14",'<button class="app-button" data-page="p12">拓扑设备管理</button>')}<div class="app-table-wrap"><table class="app-table"><thead><tr><th>设备</th><th>挂接对象</th><th>设备状态</th><th>连接状态</th><th>质量码</th><th>采样时间</th><th>挂接状态</th></tr></thead><tbody>${devices.map(d=>{const related=groups.filter(b=>b.devices.includes(d.id));return `<tr><td>${escapeHtml(d.id+" · "+d.name)}</td><td>${related.map(b=>escapeHtml(b.key.split("|")[1])).join("、")}</td><td>${escapeHtml(d.status)}</td><td>${escapeHtml(d.online)}</td><td>${escapeHtml(d.quality)}</td><td>${escapeHtml(d.sampleTime)}</td><td>${[...new Set(related.map(b=>ui.status(b)))].map(escapeHtml).join("、")}</td></tr>`;}).join("")||'<tr><td colspan="7">当前拓扑暂无设备挂接</td></tr>'}</tbody></table></div></div>`;
  }

  function renderP15() {
    return `<div class="product-page product-page-stack">${pageHeader("p15", '<button class="app-button app-button-primary" type="button" data-action="create-workorder-center">新建工单</button>')}<section class="app-kpi-grid"><div class="app-kpi-card"><div class="app-statistic-label">待派单</div><div class="app-statistic-value app-text-warning">4</div><div class="app-statistic-meta">紧急 1 · 一般 3</div></div><div class="app-kpi-card"><div class="app-statistic-label">处理中</div><div class="app-statistic-value">12</div><div class="app-statistic-meta">今日按时率 91.7%</div></div><div class="app-kpi-card"><div class="app-statistic-label">待验收</div><div class="app-statistic-value">3</div><div class="app-statistic-meta">超时 1</div></div><div class="app-kpi-card"><div class="app-statistic-label">本月闭环率</div><div class="app-statistic-value">96.4%</div><div class="app-statistic-meta app-text-success">较上月 +1.8%</div></div></section><section class="app-search-panel"><div class="app-search-grid"><label class="app-form-item"><span class="app-form-label">工单</span><input class="app-input" placeholder="编号、对象或内容" /></label><label class="app-form-item"><span class="app-form-label">状态</span><select class="app-select"><option>全部状态</option><option>待派单</option><option>处理中</option><option>待验收</option></select></label><label class="app-form-item"><span class="app-form-label">优先级</span><select class="app-select"><option>全部优先级</option><option>紧急</option><option>普通</option></select></label><div class="app-search-actions"><button class="app-button app-button-primary" type="button" data-action="workorder-query">查询</button><button class="app-button" type="button" data-action="workorder-reset">重置</button></div></div></section><div class="app-table-wrap"><table class="app-table"><thead><tr><th>工单编号</th><th>类型</th><th>关联对象</th><th>优先级</th><th>责任班组</th><th>要求完成</th><th>状态</th><th>操作</th></tr></thead><tbody><tr><td><strong>WO-2026-083</strong></td><td>阀门巡检</td><td>VALVE-V301</td><td>${tag("紧急", "error")}</td><td>城南运维班</td><td>今天 18:00</td><td>${tag(state.p02WorkorderStatus, "warning")}</td><td><button class="app-button app-button-link" type="button" data-action="select-workorder" data-value="WO-2026-083">查看</button></td></tr><tr><td><strong>WO-2026-079</strong></td><td>泵站保养</td><td>PUMP-001</td><td>${tag("普通")}</td><td>机电维护班</td><td>明天 12:00</td><td>${tag("处理中", "blue")}</td><td><button class="app-button app-button-link" type="button" data-action="select-workorder" data-value="WO-2026-079">查看</button></td></tr><tr><td><strong>WO-2026-072</strong></td><td>漏点复核</td><td>DMA-城东-02</td><td>${tag("普通")}</td><td>城东运维班</td><td>09-05 17:30</td><td>${tag("待验收", "success")}</td><td><button class="app-button app-button-link" type="button" data-page="p02dma">查看分区</button></td></tr></tbody></table></div></div>`;
  }

  function renderP16() {
    const rows=topologyReadModel.events.filter(e=>e.type==="workorder");
    return `<div class="product-page product-page-stack">${pageHeader("p16")}<div class="app-table-wrap"><table class="app-table"><thead><tr><th>任务编号</th><th>巡检名称</th><th>拓扑对象</th><th>对象名称</th><th>操作</th></tr></thead><tbody>${rows.map(e=>{const host=topologyReadModel.objects.get(e.hostId);return `<tr><td>${escapeHtml(e.id)}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.hostId)}</td><td>${escapeHtml(host?.name||"对象已移除")}</td><td><button class="app-button app-button-link" data-action="current-object-locate" data-value="${escapeHtml(e.hostId)}" ${host?"":"disabled"}>地图定位</button></td></tr>`;}).join("")||'<tr><td colspan="5">暂无巡检记录</td></tr>'}</tbody></table></div></div>`;
  }

  const historyMapConfigs = {
    dma: { page: "p06h", title: "DMA 历史记录", panel: "历史分区图层", range: "historyDma", back: "p06", backLabel: "返回 DMA 方案管理" },
    alarm: { page: "p13h", title: "报警历史记录", panel: "历史报警图层", range: "historyAlarm", back: "p13", backLabel: "返回当日报警" },
    work: { page: "p15h", title: "工单巡检历史", panel: "历史工单图层", range: "historyWork", back: "p15", backLabel: "返回工单管理" },
    data: { page: "p10h", title: "监测历史记录", panel: "历史监测图层", range: "historyData", back: "p14", backLabel: "返回数据质量" }
  };

  function historyRecords(kind) {
    if(isCampusProject())return [];
    const records = {
      dma: [
        { id: "DMA-A", time: "2026-09-07 23:59", object: "A 城西供水分区", metric: "日漏损率", value: "5.8%", status: "正常", location: "一级分区 · 边界 8 个" },
        { id: "DMA-B", time: "2026-09-07 23:59", object: "B 城北供水分区", metric: "日均压力", value: "0.319 MPa", status: "正常", location: "一级分区 · 边界 10 个" },
        { id: "DMA-C", time: "2026-09-07 23:59", object: "C 城南供水分区", metric: "日漏损率", value: "7.6%", status: "低压", location: "一级分区 · 边界 9 个" },
        { id: "DMA-A", time: "2026-09-06 23:59", object: "A 城西供水分区", metric: "进出水量差", value: "1.04 万m³", status: "正常", location: "一级分区 · 历史日快照" }
      ],
      alarm: [
        { id: "ALM-032", time: "2026-09-07 21:14", object: "P-032 城南末梢", metric: "低压报警", value: "0.184 MPa", status: "已关闭", location: "DMA-C · 持续 31 分钟" },
        { id: "ALM-018", time: "2026-09-07 14:18", object: "Q-018 北部主干管", metric: "数据延迟", value: "延迟 12 分钟", status: "已恢复", location: "DMA-B · 自动恢复" },
        { id: "ALM-032", time: "2026-09-05 03:26", object: "P-032 城南末梢", metric: "低压报警", value: "0.176 MPa", status: "已关闭", location: "DMA-C · 关联 WO-072" },
        { id: "ALM-018", time: "2026-08-29 10:42", object: "WQ-018 东北用户", metric: "余氯偏低", value: "0.18 mg/L", status: "已归档", location: "DMA-B · 人工复核" }
      ],
      work: [
        { id: "WO-2026-072", time: "2026-09-07 17:26", object: "南区漏点复核", metric: "维修工单", value: "用时 4.2 h", status: "已验收", location: "DMA-C · 城南运维班" },
        { id: "WO-2026-068", time: "2026-09-06 11:40", object: "PUMP-001 月度保养", metric: "计划工单", value: "用时 2.1 h", status: "已关闭", location: "第一水厂 · 机电维护班" },
        { id: "INS-2026-114", time: "2026-09-05 16:20", object: "V-301 季度巡检", metric: "巡检任务", value: "缺陷 1 项", status: "已转工单", location: "南部主干管 · 城南运维班" },
        { id: "INS-2026-108", time: "2026-08-30 09:35", object: "北部管线巡检", metric: "巡检任务", value: "12.6 km", status: "已完成", location: "DMA-B · 管线巡检班" }
      ],
      data: [
        { id: "P-032", time: "2026-09-07 23:55", object: "城南末梢压力点", metric: "压力", value: "0.214 MPa", status: "GOOD", location: "DMA-C · VALVE V-402" },
        { id: "Q-018", time: "2026-09-07 23:55", object: "北部主干管流量", metric: "流量", value: "281 m³/h", status: "GOOD", location: "DMA-B · 北部主干管" },
        { id: "WQ-032", time: "2026-09-07 23:50", object: "南区用户末梢水质", metric: "余氯", value: "0.21 mg/L", status: "GOOD", location: "DMA-C · 南区用户侧" },
        { id: "WL-001", time: "2026-09-07 23:55", object: "第一水厂清水池", metric: "水位", value: "4.76 m", status: "GOOD", location: "第一水厂 · 清水池" }
      ]
    };
    const range = state.mapDateRanges[historyMapConfigs[kind].range];
    if(kind==='dma'&&topologyReadModel)records.dma=topologyReadModel.zones.map(z=>({id:z.id,time:'2026-09-07 23:59',object:z.name,metric:'成员管长',value:`${(z.length/1000).toFixed(2)} km`,status:'历史快照',location:`${z.nodeIds.length} 点 / ${z.pipeIds.length} 线`}));
    if(topologyReadModel)records[kind]=records[kind].map(record=>{
      const hostId=window.TopologyMapData.historyHost(topologyReadModel,kind,record),host=topologyReadModel.objects.get(hostId);
      const zones=topologyReadModel.zoneFor(hostId).map(id=>topologyReadModel.objects.get(id)?.name).filter(Boolean);
      return {...record,hostId,object:host?host.name:record.object,location:host?host.id+' · '+(zones.join(' / ')||'分区外'):'对象已移除 · 无法定位'};
    });
    return records[kind].map((record,index) => ({...record, key: record.id + "|" + record.time, index}))
      .filter(record => record.time.slice(0,10) >= range.appliedStart && record.time.slice(0,10) <= range.appliedEnd)
      .filter(record => !state.historyQuery || Object.values(record).join(" ").toLowerCase().includes(state.historyQuery.toLowerCase()))
      .filter(record => !state.historyType || record.metric === state.historyType);
  }

  function renderHistoryDateRange(kind) {
    const config = historyMapConfigs[kind];
    const range = state.mapDateRanges[config.range];
    return `<div class="product-map-date-range product-history-date-range" aria-label="历史日期范围"><strong>历史日期</strong><label><span class="u-sr-only">开始日期</span><input class="app-input" type="date" value="${range.start}" max="2026-09-07" data-map-date data-date-context="${config.range}" data-date-field="start" aria-label="开始日期" /></label><span>至</span><label><span class="u-sr-only">结束日期</span><input class="app-input" type="date" value="${range.end}" max="2026-09-07" data-map-date data-date-context="${config.range}" data-date-field="end" aria-label="结束日期" /></label><button class="app-button app-button-small app-button-primary" type="button" data-action="apply-history-date" data-value="${kind}">查询</button><em>不含今日</em></div>`;
  }

  function renderHistoryLayers(kind) {
    const layers = state.historyLayers[kind];
    const labels = kind === "dma" ? [["basemap","基础底图"],["pipes","历史管网"],["dma","DMA 分区面"],["valves","边界阀门"]] : kind === "alarm" ? [["basemap","基础底图"],["pipes","管网骨架"],["pressure","压力点"],["alarms","历史报警"]] : kind === "work" ? [["basemap","基础底图"],["pipes","管网骨架"],["workorders","工单与巡检"]] : [["basemap","基础底图"],["pipes","管网骨架"],["pressure","压力"],["flow","流量"],["quality","水质"],["level","水位"]];
    return `<div class="product-panel-section"><strong>历史专题</strong>${labels.map(item => `<label class="product-checkbox-row"><input type="checkbox" data-history-layer="${item[0]}" data-history-kind="${kind}" ${layers[item[0]] ? "checked" : ""} /><span>${item[1]}</span></label>`).join("")}</div><div class="product-history-isolation-note"><strong>历史数据隔离</strong><span>归档记录按所选日期筛选，空间底图使用在用拓扑。</span></div>`;
  }

  function historyRecordChart(record) {
    const unit = record.value.replace(/[0-9.\s]/g,"");
    const base = Number.parseFloat(record.value);
    return echartLineMarkup({title:record.metric+"历史趋势", yAxisTitle:record.metric, unit,
      times:["00:00","04:00","08:00","12:00","16:00","20:00","23:55"],
      series:[{name:record.time.slice(0,10),data:[.93,.97,1.04,1.08,1.03,.99,1].map(n=>+(base*n).toFixed(3))}],
      ariaLabel:record.id+" "+record.time.slice(0,10)+" "+record.metric+"历史趋势"});
  }

  function renderHistoryDetail(kind) {
    const selected = state.historySelection[kind];
    const record = historyRecords(kind).find(item => item.key === selected || item.id === selected);
    if (!record) return "";
    const range = state.mapDateRanges[historyMapConfigs[kind].range];
    return `<aside class="app-gis-panel product-gis-panel product-gis-panel-right product-history-detail"><div class="app-gis-panel-header"><div><strong>${record.id} ${record.object}</strong><div class="app-text-tertiary">历史快照 · ${record.time}</div></div><button class="app-button app-button-text app-button-icon" type="button" data-action="close-history-detail" data-value="${kind}" aria-label="关闭历史详情">×</button></div><div class="app-gis-panel-body product-detail-stack"><div class="u-flex u-justify-between">${tag("历史数据", "blue")}${tag(record.status, record.status === "正常" || record.status === "GOOD" || record.status.includes("完成") || record.status.includes("关闭") ? "success" : "warning")}</div><div class="product-drawer-kpi"><div class="app-statistic-label">${record.metric}</div><div class="app-statistic-value">${record.value}</div><div class="app-statistic-meta">归档时间 ${record.time}</div></div><div class="app-descriptions"><div class="app-description-item"><div class="app-description-label">业务对象</div><div class="app-description-value">${record.object}</div></div><div class="app-description-item"><div class="app-description-label">空间范围</div><div class="app-description-value">${record.location}</div></div><div class="app-description-item"><div class="app-description-label">查询窗口</div><div class="app-description-value">${range.appliedStart} 至 ${range.appliedEnd}</div></div><div class="app-description-item"><div class="app-description-label">数据隔离</div><div class="app-description-value">历史归档库</div></div></div>${kind === "data" ? historyRecordChart(record) : '<div class="app-alert"><div><div class="app-alert-title">快照可追溯</div><div class="app-alert-description">历史时间、数值及处理状态保留；对象位置按当前在用拓扑展示。</div></div></div>'}</div></aside>`;
  }

  function renderHistoryBottom(kind) {
    const records = historyRecords(kind);
    const count = Math.max(1, Math.ceil(records.length / state.historyPageSize));
    state.historyPage = Math.min(state.historyPage, count);
    const visible = records.slice((state.historyPage - 1) * state.historyPageSize, state.historyPage * state.historyPageSize);
    const types = {dma:["日漏损率","日均压力","进出水量差"],alarm:["低压报警","数据延迟","余氯偏低"],work:["维修工单","计划工单","巡检任务"],data:["压力","流量","余氯","水位"]}[kind];
    return `<section class="app-gis-bottom product-gis-bottom product-object-drawer product-history-bottom ${state.historyBottomOpen ? "" : "is-collapsed"} ${state.historyPageSize === 20 ? "is-page-size-20" : "is-page-size-10"}"><div class="app-gis-bottom-header product-bottom-drawer-header"><strong>历史记录</strong><button class="app-button app-button-text app-button-icon" type="button" data-action="toggle-history-bottom" aria-label="${state.historyBottomOpen ? "收起历史记录" : "展开历史记录"}">${state.historyBottomOpen ? "⌄" : "⌃"}</button></div>${state.historyBottomOpen ? `<div class="product-bottom-filterbar"><input id="historySearch" class="app-input" value="${escapeHtml(state.historyQuery)}" placeholder="查询编号、对象或历史状态" /><select id="historyType" class="app-select" aria-label="历史记录类型"><option value="">全部类型</option>${types.map(type=>`<option ${state.historyType===type?"selected":""}>${type}</option>`).join("")}</select><button class="app-button app-button-primary" type="button" data-action="history-query">查询</button><button class="app-button" type="button" data-action="history-reset">重置</button></div><div class="app-gis-bottom-body product-history-table-body"><table class="app-table"><thead><tr><th>归档时间</th><th>对象编号</th><th>对象名称</th><th>记录类型</th><th>历史值</th><th>状态</th><th>空间范围</th><th>操作</th></tr></thead><tbody>${visible.map(record=>`<tr><td>${record.time}</td><td><strong>${record.id}</strong></td><td>${record.object}</td><td>${record.metric}</td><td>${record.value}</td><td>${record.status}</td><td>${record.location}</td><td><button class="app-button app-button-link" type="button" data-action="history-select" data-history-kind="${kind}" data-value="${record.key}">地图定位</button></td></tr>`).join("") || '<tr><td colspan="8"><div class="app-empty">所选范围内暂无历史记录</div></td></tr>'}</tbody></table></div><div class="app-pagination"><span>共 ${records.length} 条</span><button class="app-page-item" data-action="history-page" data-value="${state.historyPage-1}" ${state.historyPage===1?"disabled":""}>‹</button><button class="app-page-item is-active">${state.historyPage}</button><button class="app-page-item" data-action="history-page" data-value="${state.historyPage+1}" ${state.historyPage===count?"disabled":""}>›</button><label>每页 <select class="app-select" data-history-page-size><option value="10" ${state.historyPageSize===10?"selected":""}>10 条</option><option value="20" ${state.historyPageSize===20?"selected":""}>20 条</option></select></label></div>` : ""}</section>`;
  }

  function renderHistoryMap(kind) {
    const config = historyMapConfigs[kind];
    const layers = state.historyLayers[kind];
    const mapOptions = kind === "dma" ? { dma: true, points: false, expanded: true, layers, historyKind: kind } : kind === "alarm" || kind === "work" ? { points: false, operations: true, expanded: true, layers, historyKind: kind } : { points: true, quality: true, level: true, expanded: true, layers, historyKind: kind };
    const mapClass = `product-map-view-${kind === "data" ? "scada" : kind === "dma" ? "dma" : "operations"} product-history-map${layers.basemap ? "" : " is-basemap-hidden"}`;
    const mapButton = (value, label, icon) => `<button class="app-button app-button-icon product-map-tool-button" type="button" data-action="map-view" data-value="${value}" data-tooltip="${label}" title="${label}" aria-label="${label}">${mapToolIcon(icon)}</button>`;
    return `<div class="product-page product-page-gis"><div class="product-gis-frame ${state.historySelection[kind] ? "has-detail" : ""}"><div class="product-gis-contextbar"><span class="product-gis-title">${config.title}</span><span class="app-text-secondary">${escapeHtml(activeProject().name)}</span>${tag("历史归档", "blue")}<span>${escapeHtml(state.selectedTopology)} · 在用拓扑</span>${renderHistoryDateRange(kind)}<div class="product-gis-contextbar-actions"><button class="app-button" type="button" data-page="${config.back}">${config.backLabel}</button></div></div><div class="product-gis-map ${mapClass}">${networkMap(mapOptions)}</div>
      <aside class="app-gis-panel product-gis-panel product-gis-panel-left"><div class="app-gis-panel-header"><strong>${config.panel}</strong></div><div class="app-gis-panel-body">${renderHistoryLayers(kind)}</div></aside>
      <div class="app-gis-toolbar product-gis-toolbar" aria-label="地图查看工具">${mapButton("reset", "复位地图", "extent")}${mapButton("zoom-in", "放大地图", "zoomIn")}${mapButton("zoom-out", "缩小地图", "zoomOut")}<span class="product-map-zoom-label">${state.historyZoom}%</span></div>
      ${state.historySelection[kind] ? renderHistoryDetail(kind) : ""}${renderHistoryBottom(kind)}</div></div>`;
  }

  function enhanceHistoryMap() {
    const kind = ({p06h:"dma",p13h:"alarm",p15h:"work",p10h:"data"})[state.page];
    if (!kind) return;
    const map = workspace.querySelector(".product-history-map");
    const svg = map.querySelector("svg");
    // Historical markers come exclusively from the filtered archive, never current monitoring data.
    svg.querySelectorAll(".product-monitor-symbol,.product-ops-marker,.product-dma-zones").forEach(el=>el.remove());
    svg.querySelectorAll("[data-action]").forEach(el=>{el.removeAttribute("data-action");el.removeAttribute("tabindex");el.removeAttribute("role");});
    const latest = new Map();
    historyRecords(kind).forEach(record=>{if(!latest.has(record.id)) latest.set(record.id,record);});
    const chosen=historyRecords(kind).find(record=>record.key===state.historySelection[kind]);
    if(chosen)latest.set(chosen.id,chosen);
    let markup = "";
    latest.forEach(record=>{
      const selected=state.historySelection[kind]===record.key || state.historySelection[kind]===record.id;
      const attrs=`data-action="history-select" data-history-kind="${kind}" data-value="${record.key}" role="button" tabindex="0" aria-label="查看 ${record.id} ${record.time} 历史记录"`;
      if(kind==="dma"){
        if(!state.historyLayers.dma.dma) return;
        const dma=findDma(record.id);
        markup+=`<g ${attrs}><path class="product-dma-zone ${selected?"is-selected":""}" d="${dma.path}" style="--dma-zone-color:${state.dmaZoneColors[dma.id]}"></path><text x="${dma.labelX}" y="${dma.labelY}" class="product-zone-label">${record.id}</text></g>`;
      } else {
        const layer=kind==="alarm"?"alarms":kind==="work"?"workorders":({"压力":"pressure","流量":"flow","余氯":"quality","水位":"level"}[record.metric]);
        if(!state.historyLayers[kind][layer]) return;
        const position=topologyReadModel?.position(record.hostId);if(!position)return;
        const [x,y]=position;
        const code=kind==="alarm"?"!":kind==="work"?(record.id.startsWith("INS")?"巡":"单"):({"压力":"P","流量":"Q","余氯":"WQ","水位":"WL"}[record.metric]);
        markup+=`<g ${attrs} transform="translate(${x} ${y})" class="product-history-marker ${selected?"is-selected":""}"><circle r="17"></circle><text text-anchor="middle" y="5">${code}</text><title>${record.object} · ${record.value} · ${record.time}</title></g>`;
      }
    });
    svg.insertAdjacentHTML("beforeend",markup);
    const selectedRecord=historyRecords(kind).find(r=>r.key===state.historySelection[kind]||r.id===state.historySelection[kind]);
    const focus=selectedRecord&&topologyReadModel.position(selectedRecord.hostId);
    if(focus&&!state.historyBottomOpen)svg.setAttribute('viewBox',`${focus[0]-225} ${focus[1]-135} 450 270`);
    svg.style.transform=`scale(${state.historyZoom/100})`;
    svg.style.transformOrigin="center";
    if(!latest.size) map.insertAdjacentHTML("beforeend",'<div class="product-history-empty">所选范围内暂无历史记录</div>');
  }

  const renderers = { hydraulicHistory:()=>v2Platform().render("hydraulicHistory"),qualityHistory:()=>v2Platform().render("qualityHistory"),modelReview:()=>v2Platform().render("modelReview"), emergency:()=>v2Platform().render("emergency"), hydraulicModel:()=>v2Platform().render("hydraulicModel"), valveAnalysis:()=>v2Platform().render("valveAnalysis"), burstAnalysis:()=>v2Platform().render("burstAnalysis"), agingAnalysis:()=>v2Platform().render("agingAnalysis"), leakAnalysis:()=>v2Platform().render("leakAnalysis"), qualityModel:()=>v2Platform().render("qualityModel"), qualityScenes:()=>v2Platform().render("qualityScenes"), qualityEvent:()=>v2Platform().render("qualityEvent"), qualityMap:()=>v2Platform().render("qualityMap"), calculationCenter:()=>v2Platform().render("calculationCenter"), resultCompare:()=>v2Platform().render("resultCompare"), controlPlans:()=>v2Platform().render("controlPlans"), hydraulic:()=>v2Platform().render("hydraulic"), hydraulicTrial:()=>v2Platform().render("hydraulic"), hydraulicResults:()=>v2Platform().render("hydraulic"), simulation:()=>hydraulics().render("simulation"), reports:()=>standardProduct().render("reports"),leakage:()=>standardProduct().render("leakage"),devices:renderDeviceManagement,p01: renderP01, p02: () => renderP02("operations"), p02dma: () => renderP02("dma"), p02asset: () => renderP02("assets"), p03: renderP03, p04: renderP04, p06: renderP06, p06compare:renderDMACompare, p06h: () => renderHistoryMap("dma"), p07: renderP07, p08: renderP08, p09: renderP09, p10: renderP10, p10h: () => renderHistoryMap("data"), p11: renderP11, p12: renderBindingManagement, p13: () => operations().renderMap("p13"), p13h: () => operations().renderMap("p13h"), p14: renderP14, p15: () => operations().renderMap("p15"), p15h: () => operations().renderMap("p15h"), p16: () => operations().render("p16") };

  function tableConfigKey(table, index, root) {
    const labels = [...table.querySelectorAll("thead th")].map((cell, columnIndex) => cell.textContent.trim() || `第${columnIndex + 1}列`).join("|");
    let hash = 0;
    for (let i = 0; i < labels.length; i += 1) hash = ((hash << 5) - hash + labels.charCodeAt(i)) | 0;
    return `${state.page}-${root.id || "root"}-${index}-${Math.abs(hash)}`;
  }

  function applyTableColumnVisibility(table, visibility) {
    [...table.rows].forEach(row => [...row.cells].forEach((cell, index) => { cell.style.display = visibility[index] === false ? "none" : ""; }));
  }

  function enhanceConfigurableTables(root) {
    [...root.querySelectorAll("table.app-table")].forEach((table, index) => {
      if (table.closest(".product-configurable-table")) return;
      const headers = [...table.querySelectorAll("thead th")];
      if (!headers.length) return;
      const key = tableConfigKey(table, index, root);
      if (!state.tableColumnVisibility[key] || state.tableColumnVisibility[key].length !== headers.length) state.tableColumnVisibility[key] = headers.map(() => true);
      const visibility = state.tableColumnVisibility[key];
      const component = document.createElement("div");
      component.className = "product-configurable-table";
      table.parentNode.insertBefore(component, table);
      const configbar = document.createElement("div");
      configbar.className = "product-table-configbar";
      configbar.innerHTML = `<button class="app-button app-button-small product-table-config-button" type="button" data-action="toggle-table-columns" data-value="${key}" aria-expanded="${state.tableColumnPanel === key}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"></path><circle cx="16" cy="6" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg>列设置</button>${state.tableColumnPanel === key ? `<div class="product-table-column-popover" role="dialog" aria-label="配置表格字段"><strong>显示字段</strong>${headers.map((header, columnIndex) => `<label><input type="checkbox" data-table-column="${columnIndex}" data-table-config="${key}" ${visibility[columnIndex] ? "checked" : ""} />${escapeHtml(header.textContent.trim() || `第${columnIndex + 1}列`)}</label>`).join("")}</div>` : ""}`;
      const scroll = document.createElement("div");
      scroll.className = "product-configurable-table-scroll";
      component.append(configbar, scroll);
      scroll.appendChild(table);
      applyTableColumnVisibility(table, visibility);
    });
  }

  function enhanceBottomTablePagination(root) {
    const body = root.querySelector(".product-bottom-drawer-body");
    const table = body?.querySelector("table.app-table");
    if (!table?.tBodies.length) return;
    const scope = state.page === "p10" ? "p10" : "p02";
    const pageKey = scope === "p10" ? "p10BottomPage" : "p02BottomPage";
    const sizeKey = scope === "p10" ? "p10BottomPageSize" : "p02BottomPageSize";
    const rows = [...table.tBodies[0].rows];
    const pageSize = state[sizeKey];
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, state[pageKey]), totalPages);
    state[pageKey] = page;
    rows.forEach((row, index) => { row.hidden = index < (page - 1) * pageSize || index >= page * pageSize; });
    const pagination = document.createElement("div");
    pagination.className = "product-bottom-pagination";
    pagination.setAttribute("aria-label", "表格分页");
    pagination.innerHTML = `<span>共 ${rows.length} 条</span><div class="product-bottom-page-buttons"><button class="app-page-item" type="button" data-action="bottom-page" data-value="${page - 1}" data-pagination-scope="${scope}" aria-label="上一页" ${page === 1 ? "disabled" : ""}>‹</button>${Array.from({ length: totalPages }, (_, index) => index + 1).map(pageNumber => `<button class="app-page-item ${pageNumber === page ? "is-active" : ""}" type="button" data-action="bottom-page" data-value="${pageNumber}" data-pagination-scope="${scope}" aria-label="第 ${pageNumber} 页">${pageNumber}</button>`).join("")}<button class="app-page-item" type="button" data-action="bottom-page" data-value="${page + 1}" data-pagination-scope="${scope}" aria-label="下一页" ${page === totalPages ? "disabled" : ""}>›</button></div><label class="product-bottom-page-size">每页<select class="app-select" data-bottom-page-size="${scope}" aria-label="每页条数"><option value="10" ${pageSize === 10 ? "selected" : ""}>10 条</option><option value="20" ${pageSize === 20 ? "selected" : ""}>20 条</option></select></label>`;
    table.closest(".product-configurable-table")?.appendChild(pagination);
  }

  function renderMessageCenter() {
    const db=operations().load();
    const entries=[...db.alarms.filter(a=>a.status==='待确认'&&a.notifyEnabled!==false).map(a=>({id:a.id+':ack',type:'alarm',typeLabel:'报警',title:a.name,description:'待确认 · '+a.id,time:new Date(a.createdAt).toLocaleString('zh-CN'),target:'p13',value:a.id})),...db.orders.filter(w=>['待派单','待接单','待验收'].includes(w.status)).map(w=>({id:w.id+':'+w.status,type:'workorder',typeLabel:'工单',title:w.name,description:w.status+' · '+w.assignee,time:new Date(w.createdAt).toLocaleString('zh-CN'),target:'p15',value:w.id}))];
    messageCenterItems.splice(0,messageCenterItems.length,...entries,...messageCenterItems.filter(m=>!['alarm','workorder'].includes(m.type)));
    const visibleMessages=isCampusProject()?entries:messageCenterItems;
    const unread = visibleMessages.filter(item => !state.messageRead.includes(item.id)).length;
    messageUnreadCount.textContent = unread;
    messageUnreadCount.hidden = unread === 0;
    messageCenterButton.setAttribute("aria-expanded", String(state.messageCenterOpen));
    messageCenterButton.setAttribute("aria-label", `${state.messageCenterOpen ? "关闭" : "打开"}消息盒子${unread ? `，${unread} 条未读` : ""}`);
    if (!state.messageCenterOpen) {
      messageCenterRoot.innerHTML = "";
      return;
    }
    const iconText = { workorder: "单", alarm: "警", model: "算", system: "系" };
    messageCenterRoot.innerHTML = `<button class="product-message-mask" type="button" data-action="close-message-center" aria-label="关闭消息盒子"></button><section class="product-message-panel" role="dialog" aria-label="消息盒子"><div class="product-message-header"><div><strong>消息盒子</strong><span>${unread ? `${unread} 条未读` : "消息已全部阅读"}</span></div><button class="app-button app-button-link" type="button" data-action="mark-all-messages-read" ${unread ? "" : "disabled"}>全部已读</button></div><div class="product-message-list">${visibleMessages.map(item => {
      const read = state.messageRead.includes(item.id);
      return `<button class="product-message-item ${read ? "" : "is-unread"}" type="button" data-action="open-message" data-message-id="${item.id}" data-message-type="${item.type}" data-message-target="${item.target}" data-message-value="${item.value}" aria-label="打开消息：${escapeHtml(item.title)}"><i class="product-message-type is-${item.type}">${iconText[item.type]}</i><span class="product-message-content"><span class="product-message-meta"><em>${item.typeLabel}</em><time>${item.time}</time></span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span>${read ? "" : '<i class="product-message-unread" aria-label="未读"></i>'}</button>`;
    }).join("")}</div></section>`;
  }

  const mapCameras=new Map();
  function mountMapCameras(){
    const C=window.WaterMapViewport;if(!C)return;
    const editorSvg=workspace.querySelector('[data-we-map]');
    if(editorSvg&&liveTopologyEditor){const session=liveTopologyEditor.s;C.attach(editorSvg,{base:[0,0,900,540],view:session.view,onChange:view=>session.view=view,canPan:()=>!session.editing||session.tool==='select'});}
    hydraulicUI?.mountViewport();v2UI?.mountViewport();
    workspace.querySelectorAll('.product-gis-map .unified-topology-svg').forEach((svg,index)=>{
      const key=[state.activeProjectId,state.selectedTopology,state.page,index].join('|'),cached=mapCameras.get(key),base=[0,0,900,540];
      const viewKey=isP02Page()?'p02Zoom':state.page==='p10'?'p10Zoom':'historyZoom';
      const factor=state[viewKey]/100||1,initial=[450-450/factor,270-270/factor,900/factor,540/factor];
      const map=svg.closest('.product-gis-map');map.dataset.mapCamera='true';svg.style.transform='none';
      C.attach(svg,{base,view:cached||initial,onChange:(view,settled)=>{mapCameras.set(key,view);const zoom=Math.round(900/view[2]*100);state[viewKey]=zoom;
        const context=isP02Page()?p02ViewFromPage():state.page==='p10'?'scada':null;
        if(context&&settled){const layers=context==='scada'?state.p10Layers:state.p02LayersByView[context],presentation=mapStylePresentation(context,zoom,layers);for(const cls of [...map.classList])if(cls.startsWith('is-style-hidden-')||cls==='is-labels-hidden')map.classList.remove(cls);presentation.className.split(' ').forEach(cls=>map.classList.add(cls));map.style.cssText=presentation.style;}
        const label=svg.closest('[data-map-workspace]')?.querySelector('.product-map-zoom-label');if(label)label.textContent='L'+mapLevelFromZoom(zoom)+' · '+zoom+'%';
      },canPan:()=>!isP02Page()||state.p02Tool==='select'});
    });
  }

  function render() {
    window.WaterMapViewport?.flush();
    if(state.authenticated&&isSchoolAccount()){
      state.activeProjectId=window.SchoolAccess.projectId;
      if(!window.SchoolAccess.canPage(state.page)){state.page=window.SchoolAccess.home;history.replaceState(null,'','#'+state.page);}
    }
    if(isHydraulicPage(state.page)&&state.productVersion!==2){state.page="p02";history.replaceState(null,"","#p02");}
    lineChartInstances.forEach(instance => instance.dispose());
    lineChartInstances = [];
    if (!state.authenticated) {
      state.page = "login";
      productShell.hidden = true;
      entryRoot.hidden = false;
      entryRoot.innerHTML = renderLogin();
      overlayRoot.innerHTML = "";
      document.title = "登录 · 城市供水管网 GIS + SCADA";
      return;
    }
    if (state.page === "projects" || !state.activeProjectId) {
      state.page = "projects";
      productShell.hidden = true;
      entryRoot.hidden = false;
      entryRoot.innerHTML = renderProjects();
      enhanceConfigurableTables(entryRoot);
      document.title = "城市项目 · 城市供水管网 GIS + SCADA";
      renderModal();
      return;
    }
    if (!renderers[state.page]) state.page = "p02";
    syncTopologyReadModel();
    entryRoot.hidden = true;
    productShell.hidden = false;
    renderNav();
    renderProjectOptions();
    renderMessageCenter();
    if (liveTopologyEditor && !["p04", "p07"].includes(state.page)) liveTopologyEditor.pause();
    workspace.classList.toggle('is-campus-project',isCampusProject());
    workspace.innerHTML = isCampusProject()&&isHydraulicPage(state.page)?renderCampusHydraulicPending():renderers[state.page]();
    workspace.querySelectorAll('.product-current-data-scope').forEach(el=>{const bucket=topologyStore().dmaPlans?.[state.selectedTopology],plan=bucket?.items.find(p=>p.id===bucket.activeId);el.textContent=isCampusProject()?state.selectedTopology+' · '+(plan?.name||'假定分区')+(dmaDemoEnabled()?' · 演示数据':' · 未接入监测'):topologyReadModel.history?'历史拓扑 · 示例数据':state.selectedTopology+' · '+(plan?.name||'当前分区')+' · 示例数据';});
    if(!['p13h','p15h'].includes(state.page)) enhanceHistoryMap();
    const historyKind = ({ p06h: "dma", p10h: "data", p13h: "alarm", p15h: "work" })[state.page];
    const timeModeButton = document.getElementById("timeModeButton");
    const timeModeText = document.getElementById("timeModeText");
    const globalTime = document.getElementById("globalTime");
    if (historyKind) {
      const range = state.mapDateRanges[historyMapConfigs[historyKind].range];
      timeModeButton.className = "product-context-button is-history";
      timeModeText.textContent = "历史归档";
      globalTime.textContent = ["p13h","p15h"].includes(state.page) ? "按实际归档时间查询" : `${range.appliedStart} 至 ${range.appliedEnd}`;
    } else {
      timeModeButton.className = "product-context-button is-realtime";
      timeModeText.textContent = "最新";
      globalTime.textContent = "更新时间 14:32:18";
    }
    const accountBadge=document.querySelector('.product-user');
    accountBadge.title=isSchoolAccount()?'school1 · 学校专供':state.productVersion===2?'admin · 全部功能':'1.0 演示账号 · 仅 1.0 功能';
    accountBadge.querySelector('.product-avatar').textContent=isSchoolAccount()?'校':state.productVersion===2?'管':'1';
    accountBadge.lastElementChild.textContent=isSchoolAccount()?'学校专供':state.productVersion===2?'admin · 全部功能':'产品 1.0';
    const hydraulicPage=isHydraulicPage(state.page);
    document.querySelector('.unified-version-control').hidden=hydraulicPage;
    if(hydraulicPage){timeModeText.textContent='计算结果';globalTime.textContent='';}
    if(isCampusProject()){timeModeText.textContent=historyKind?'历史归档':'当前拓扑';globalTime.textContent='';}
    applySchoolScope();
    window.WaterMapLayout.enhance(workspace);
    mountMapCameras();
    enhanceConfigurableTables(workspace);
    enhanceBottomTablePagination(workspace);
    initializeLineCharts(workspace);
    document.title = `${pageMeta[state.page][0]} · ${activeProject().name}`;
    workspace.focus({ preventScroll: true });
    renderModal();
  }

  function navigate(page, useActive = false) {
    if(state.authenticated&&isSchoolAccount()){
      state.activeProjectId=window.SchoolAccess.projectId;
      if(!window.SchoolAccess.canPage(page))page=window.SchoolAccess.home;
    }
    if(useActive && state.activeProjectId) {
      state.selectedTopology=activeTopology()?.id || topologyStore().versions[0]?.id;
      state.p02Drawer=null;state.p02SelectedObjects=[];state.p02DmaFocus=null;
      state.p02FocusedNode=null;state.bindingDraft=null;state.p08Selected=null;
      if(deviceBindingUI){deviceBindingUI.object=null;deviceBindingUI.draft=null;}
    }
    if (page === "p05") { state.p04Toolbox = "check"; page = "p04"; }
    if(['hydraulic', 'hydraulicTrial', 'hydraulicResults', 'simulation', 'hydraulicModel', 'valveAnalysis', 'emergency', 'burstAnalysis', 'agingAnalysis', 'leakAnalysis', 'qualityModel', 'qualityScenes', 'qualityEvent', 'qualityMap', 'hydraulicHistory', 'qualityHistory', 'modelReview', 'calculationCenter', 'resultCompare', 'controlPlans'].includes(page)&&state.productVersion!==2){showToast("该功能仅对 admin 全功能账号开放");page="p02";}
    if (!state.authenticated) page = "login";
    if (page !== "login" && page !== "projects" && !state.activeProjectId) page = "projects";
    if (isP02Page(page) && page !== state.page) {
      const drawerValue = typeof state.p02Drawer === "string" ? state.p02Drawer : "";
      const retainViewObject = page === "p15" && /^workorder:/.test(drawerValue) || page === "p13" && /^alarm:/.test(drawerValue) || page === "p02" && /^(monitor|alarm|workorder):/.test(drawerValue) || page === "p02dma" && /^dma:/.test(drawerValue) || page === "p02asset" && /^(asset|pipe|node):/.test(drawerValue);
      if (!retainViewObject) { state.p02Drawer = null; state.p02SelectedObjects = []; }
      state.p02Tab = "layers";
      state.p02SearchQuery = "";
      state.p02SearchExecuted = false;
      state.p02BottomOpen = false;
      state.p02LayerOpen = true;
      state.p02BottomPage = 1;
      state.p02Tool = "select";
      state.p02SelectionShape = null;
      state.p02FullExtent = false;
      state.p02Zoom = 100;
      if (page === "p02dma") state.p02DmaFocus = null;
    }
    if (page === "p10" && page !== state.page) {
      state.p10BottomOpen = false;
      state.p10BottomPage = 1;
      state.p10LayerOpen = true;
      state.p10Zoom = 100;
    }
    if (page !== state.page) { state.historyQuery = ""; state.historyType = ""; state.historyPage = 1; state.historyBottomOpen = true; }
    state.layerStyleEditor = null;
    state.navDrawerOpen = false;
    state.page = page;
    location.hash = page;
    render();
  }

  function showToast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `product-toast ${type === "success" ? "" : `is-${type}`}`;
    item.textContent = message;
    toastRoot.appendChild(item);
    window.setTimeout(() => item.remove(), 2800);
  }

  function openModal(type) {
    state.modal = type;
    renderModal();
  }

  function renderModal() {
    if (!state.modal) { overlayRoot.innerHTML = ""; return; }
    let title = "操作确认";
    let body = "";
    let confirm = "确认";
    let action = "modal-confirm";
    if (state.modal === "project-create" || state.modal === "project-edit") {
      const project = state.projects.find(item => item.id === state.editingProjectId);
      const editing = state.modal === "project-edit" && project;
      const province = editing ? project.province : Object.keys(regionOptions)[0];
      const city = editing ? project.city : Object.keys(regionOptions[province])[0];
      const district = editing ? project.district : regionOptions[province][city][0];
      title = editing ? "编辑项目" : "新建项目"; confirm = editing ? "保存修改" : "创建项目"; action = "confirm-project-save";
      body = `<div class="product-modal-body-stack"><label class="app-form-item"><span class="app-form-label is-required">项目名称</span><input id="projectNameInput" class="app-input" value="${editing ? escapeHtml(project.name) : ""}" placeholder="例如：杭州市城区供水" /></label><div class="app-grid app-grid-3"><label class="app-form-item"><span class="app-form-label is-required">省</span><select id="projectProvinceInput" class="app-select">${Object.keys(regionOptions).map(item => `<option ${item === province ? "selected" : ""}>${item}</option>`).join("")}</select></label><label class="app-form-item"><span class="app-form-label is-required">市</span><select id="projectCityInput" class="app-select">${Object.keys(regionOptions[province]).map(item => `<option ${item === city ? "selected" : ""}>${item}</option>`).join("")}</select></label><label class="app-form-item"><span class="app-form-label is-required">区</span><select id="projectDistrictInput" class="app-select">${regionOptions[province][city].map(item => `<option ${item === district ? "selected" : ""}>${item}</option>`).join("")}</select></label></div><div class="product-project-form-grid"><label class="app-form-item"><span class="app-form-label is-required">项目状态</span><select id="projectStatusInput" class="app-select">${["运行中", "建设中", "已停用"].map(status => `<option ${editing && project.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><label class="app-form-item"><span class="app-form-label is-required">负责人</span><input id="projectOwnerInput" class="app-input" value="${editing ? escapeHtml(project.owner) : ""}" placeholder="请输入负责人" /></label></div><div id="projectFormError" class="app-form-error" role="alert"></div></div>`;
    } else if (state.modal === "project-delete") {
      const project = state.projects.find(item => item.id === state.editingProjectId);
      title = "删除项目"; confirm = "确认删除"; action = "confirm-project-delete";
      body = `<div class="product-modal-body-stack"><div class="app-alert app-alert-error"><div><div class="app-alert-title">删除后将从项目列表移除</div><div class="app-alert-description">确定删除“${project ? escapeHtml(project.name) : "该项目"}”吗？</div></div></div></div>`;
    } else if (state.modal === "derive-topology") {
      title = "基于已有拓扑创建"; confirm = "创建并进入编辑"; action = "confirm-derive";
      body = `<div class="product-modal-body-stack"><label class="app-form-item"><span class="app-form-label is-required">拓扑名称</span><input class="app-input" value="城区改造方案 B-副本" /></label><label class="app-form-item"><span class="app-form-label">来源拓扑</span><select class="app-select"><option>城区改造方案 B</option><option>城区现状管网</option></select></label><label class="app-form-item"><span class="app-form-label">描述</span><textarea class="app-textarea" placeholder="请输入本次方案用途">城区改造方案拓扑编辑与检查</textarea></label><div class="product-modal-summary"><strong>来源摘要</strong><span>管长 1,294.9 km · 节点 24,918 · SCADA 继承预估 98.8%</span></div></div>`;
    } else if (state.modal === "split-pipe") {
      title = "确认分割管线"; confirm = "确认分割"; action = "confirm-split";
      body = `<div class="product-modal-body-stack"><div class="product-modal-summary"><strong>原管线：PIPE001</strong><span>分割位置距起点 128.6 m</span></div><div class="app-alert app-alert-warning"><div><div class="app-alert-title">将按事务整体创建</div><div class="app-alert-description">NODE-NEW、PIPE001-A、PIPE001-B；任一步失败都会整体回滚。</div></div></div></div>`;
    } else if (state.modal === "create-l1") {
      title = "新增一级分区"; confirm = "进入多边形选择"; action = "confirm-l1";
      body = `<div class="product-modal-body-stack"><label class="app-form-item"><span class="app-form-label is-required">一级分区名称</span><input class="app-input" value="城南分区" /></label><label class="app-form-item"><span class="app-form-label">空间选择规则</span><select class="app-select"><option>完全位于范围内</option><option>与范围相交</option><option>中心点位于范围内</option></select></label><div class="product-modal-summary"><strong>候选范围元素</strong><span>Pipe 1,283 · Node 1,046 · Valve 83 · Facility 12</span></div></div>`;
    } else if (state.modal === "bind") {
      title = "确认新绑定"; confirm = "确认绑定"; action = "confirm-binding-save";
      body = `<div class="product-modal-body-stack"><div class="product-modal-summary"><strong>设备 P018 → ${state.p12Candidate}</strong><span>旧绑定将结束有效期，新 Binding 状态记录为 MANUAL。</span></div><label class="app-form-item"><span class="app-form-label is-required">生效时间</span><input class="app-input" value="2026-09-01 14:30:00" /></label><label class="app-form-item"><span class="app-form-label">备注</span><textarea class="app-textarea">拓扑改造后人工复核挂接</textarea></label></div>`;
    } else if (state.modal === "merge-node") {
      title = "合并节点"; confirm = "确认合并"; action = "confirm-merge";
      body = `<div class="product-modal-body-stack"><label class="app-form-item"><span class="app-form-label">保留节点</span><select class="app-select"><option>NODE001</option><option>NODE002</option></select></label><div class="app-alert app-alert-warning"><div><div class="app-alert-title">连接关系将迁移</div><div class="app-alert-description">NODE002 当前连接 3 根管线，合并后连接将转移至保留节点。</div></div></div></div>`;
    } else if (state.modal === "delete-islands") {
      const selected = topologyCheckIssues.filter(issue => state.p05SelectedIslands.includes(issue.id) && !state.p05DeletedIslands.includes(issue.id));
      title = "批量删除孤岛"; confirm = "确认批量删除"; action = "confirm-delete-islands";
      body = `<div class="product-modal-body-stack"><div class="app-alert app-alert-error"><div><div class="app-alert-title">将删除 ${selected.length} 个孤岛中的全部成员</div><div class="app-alert-description">${selected.map(issue => `${issue.objectId}（${issue.metric}）`).join("；")}。删除将作为同一个拓扑编辑变更集提交，可在保存前撤销。</div></div></div><div class="product-modal-summary"><strong>删除影响</strong><span>孤岛中的Pipe、Node及关联点元素将一起进入待删除状态；当前操作不会直接修改使用中拓扑。</span></div></div>`;
    }
    const confirmClass = action === "confirm-project-delete" || action === "confirm-delete-islands" ? "app-button app-button-danger" : "app-button app-button-primary";
    overlayRoot.innerHTML = `<div class="app-mask" data-action="modal-close"></div><section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="app-modal-header"><h2 id="modalTitle" class="app-card-title">${title}</h2><button class="app-button app-button-text app-button-icon" type="button" data-action="modal-close" aria-label="关闭">×</button></div><div class="app-modal-body">${body}</div><div class="app-modal-footer"><button class="app-button" type="button" data-action="modal-close">取消</button><button class="${confirmClass}" type="button" data-action="${action}">${confirm}</button></div></section>`;
    enhanceConfigurableTables(overlayRoot);
  }

  function submitLogin() {
    const account = document.getElementById("loginAccount").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const error = document.getElementById("loginError");
    if (!account || !password) {
      error.textContent = "请输入账号和密码。";
      return;
    }
    if(account==='viewer1' && password!=='Viewer@2026'){error.textContent='产品 1.0 演示账号密码不正确。';return;}
    if(window.SchoolAccess.isSchool(account)&&!window.SchoolAccess.authenticate(account,password)){error.textContent='学校专供账号密码不正确。';return;}
    state.account=account;
    state.productVersion=account==='admin'?2:1;
    state.authenticated = true;
    if(isSchoolAccount()){
      state.navGroup='maps';state.navDrawerOpen=false;state.p02Drawer=null;state.p10UserSelected=null;state.p10Drawer=false;state.modal=null;
      state.activeProjectId=window.SchoolAccess.projectId;state.page=window.SchoolAccess.home;location.hash=state.page;render();showToast('已进入学校专供版');return;
    }
    state.page = "projects";
    location.hash = "projects";
    render();
    showToast("登录成功，已进入城市项目管理");
  }

  function saveProject() {
    const name = document.getElementById("projectNameInput").value.trim();
    const province = document.getElementById("projectProvinceInput").value;
    const city = document.getElementById("projectCityInput").value;
    const district = document.getElementById("projectDistrictInput").value;
    const status = document.getElementById("projectStatusInput").value;
    const owner = document.getElementById("projectOwnerInput").value.trim();
    const error = document.getElementById("projectFormError");
    if (!name || !province || !city || !district || !owner) {
      error.textContent = "请填写项目名称、省市区和负责人。";
      return;
    }
    const existing = state.projects.find(project => project.id === state.editingProjectId);
    if (existing) {
      Object.assign(existing, { name, province, city, district, status, owner, updated: "2026-09-02 15:00" });
    } else {
      const nextNumber = Math.max(0, ...state.projects.map(project => Number(project.id.replace("PRJ-", "")) || 0)) + 1;
      state.projects.push({ id: `PRJ-${String(nextNumber).padStart(3, "0")}`, name, province, city, district, status, owner, updated: "2026-09-02 15:00" });
    }
    state.modal = null;
    state.editingProjectId = null;
    render();
    showToast(existing ? "项目信息已更新" : "项目已创建");
  }

  function updateProjectCities() {
    const provinceSelect = document.getElementById("projectProvinceInput");
    const citySelect = document.getElementById("projectCityInput");
    if (!provinceSelect || !citySelect) return;
    citySelect.innerHTML = Object.keys(regionOptions[provinceSelect.value]).map(city => `<option>${city}</option>`).join("");
    updateProjectDistricts();
  }

  function updateProjectDistricts() {
    const provinceSelect = document.getElementById("projectProvinceInput");
    const citySelect = document.getElementById("projectCityInput");
    const districtSelect = document.getElementById("projectDistrictInput");
    if (!provinceSelect || !citySelect || !districtSelect) return;
    districtSelect.innerHTML = regionOptions[provinceSelect.value][citySelect.value].map(district => `<option>${district}</option>`).join("");
  }


  function handleTopologyAction(action,value){
    const store=topologyStore(), t=store.versions.find(v=>v.id===value);
    const now=new Date().toLocaleString("sv-SE");
    if(action==="topology-query"){state.topologyQuery=document.getElementById("topologyQuery").value.trim();state.topologyStatus=document.getElementById("topologyStatus").value;}
    if(action==="topology-reset"){state.topologyQuery="";state.topologyStatus="";}
    if(action==="topology-new"||action==="topology-copy"){
      const id="T"+(Math.max(...store.versions.map(v=>Number(v.id.slice(1))))+1);
      if(t){
        const previous=state.selectedTopology;state.selectedTopology=t.id;
        const snapshot=JSON.parse(JSON.stringify(topologyEditor().s.saved));
        localStorage.setItem(`water-editor:${state.activeProjectId||'PRJ-001'}:${id}`,JSON.stringify(snapshot));
        window.WaterDeviceBinding.inherit(store,t.id,id);
        if(store.dmaPlans?.[t.id])store.dmaPlans[id]=JSON.parse(JSON.stringify(store.dmaPlans[t.id]));
        state.selectedTopology=previous;
      }
      store.versions.push({id,name:(t?t.name+" · 副本":"新建拓扑")+" "+id,status:"编辑中",published:"—"});
      persistTopologyStore();
      state.selectedTopology=id;state.p04Dirty=false;navigate("p04");return;
    }
    if(action==="topology-export"){
      if(!t)return;const snapshot=compareSnapshot(t.id),link=document.createElement("a");
      const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"}));
      link.href=url;link.download=`${t.id}-topology.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==="topology-compare"){if(!t)return;state.selectedTopology=t.id;state.p08Selected=null;navigate("p08");return;}
    if(action==="topology-open" || action==="topology-devices"){
      if(!t)return;
      state.selectedTopology=value;state.topologyContextProject=state.activeProjectId;
      if(deviceBindingUI){deviceBindingUI.object=null;deviceBindingUI.draft=null;}
      navigate(action==="topology-devices"?"p12":"p04");
      if(action==="topology-open" && t.status!=="历史归档" && value!=="T0")topologyEditor().action("edit");
      return;
    }
    if(action==="topology-publish" && t?.status==="编辑中"){
      if(state.selectedTopology===t.id&&state.p04Dirty){showToast("请先保存编辑变更再发布","warning");return;}
      t.status="已发布";t.published=now;
    }
    if(action==="topology-use" && t?.status==="已发布"){
      const current=activeTopology();
      if(current)current.status="已发布";
      store.epochs.filter(e=>!e.end).forEach(e=>e.end=now);
      // Bindings belong to each version; activating a successor must not erase copied rules.
      store.epochs.push({topology:t.id,start:now,end:null});t.status="使用中";state.selectedTopology=t.id;state.bindingDraft=null;
      showToast("使用版本已切换，保留各版本挂接与规则，请核对继承关系");
    }
    if(action==="topology-retire" && ["编辑中","已发布"].includes(t?.status))t.status="已废弃";
    if(action==="binding-object"){state.bindingObject=value;state.bindingDraft=null;state.bindingMessage="";}
    if(action==="binding-metric"){state.bindingMetric=value;state.bindingDraft=null;state.bindingMessage="";}
    if(action==="binding-cancel"){state.bindingDraft=null;state.bindingMessage="已恢复保存配置";}
    if(action==="binding-save"){
      if(topologyReadModel?.history){showToast("历史拓扑只读，不能修改挂接");return;}
      const draft=bindingConfig();
      if(!activeTopology() || !draft.devices.length){showToast("请选择使用中拓扑的设备","warning");return;}
      const old=store.bindings.find(b=>b.key===draft.key);
      const previous=[...store.bindings,...store.bindingHistory].filter(b=>b.key===draft.key);
      if(old)store.bindingHistory.push({...old,end:now});
      const saved={...JSON.parse(JSON.stringify(draft)),revision:previous.length+1,start:now};
      store.bindings=store.bindings.filter(b=>b.key!==draft.key);store.bindings.push(saved);state.bindingDraft=null;
      state.bindingMessage="已保存，规则自 "+now+" 生效；历史数据保留原规则版本。";
    }
    persistTopologyStore();render();
  }
  function handleAction(action, target) {
    if(state.authenticated&&isSchoolAccount()&&!window.SchoolAccess.canAction(action)){showToast('学校专供账号未开放此功能');return;}
    if(action==='ops-open-record'){operations().open(target.dataset.kind==='alarm'?'p13':'p15',target.dataset.value);return;}
    if(['create-map-workorder','create-workorder-center'].includes(action)){navigate('p15');operations().action('work-new','');return;}
    if(action==='create-inspection'){navigate('p16');operations().action('task-new','');return;}
    if(action==='select-workorder' && state.page!=='p02'){state.opsMapFocus=null;operations().open(state.page==='p15h'?'p15h':'p15',target.dataset.value);return;}
    if(action==='select-map-alarm' && state.page!=='p02'){state.opsMapFocus=null;operations().open(state.page==='p13h'?'p13h':'p13',target.dataset.value);return;}
    if(action.startsWith('dma-plan-')){
      const bucket=dmaBucket(),id=target.dataset.value,plan=bucket.items.find(p=>p.id===id);
      if(action==='dma-plan-cancel'){state.dmaPlanForm=null;state.dmaActivate=null;}
      if(action==='dma-plan-new')state.dmaPlanForm={name:'',source:null};
      if(action==='dma-plan-copy'){state.dmaPlanForm={name:(plan?.name||'方案')+' · 副本',source:id};navigate('p06');return;}
      if(action==='dma-plan-rename')state.dmaPlanForm={name:plan.name,rename:id};
      if(action==='dma-plan-confirm'){
        const form=state.dmaPlanForm,name=document.getElementById('dmaPlanName')?.value.trim();
        try{if(!name)throw Error('请输入方案名称');if(form.rename){if(bucket.items.some(p=>p.id!==form.rename&&p.name===name))throw Error('方案名称已存在');bucket.items.find(p=>p.id===form.rename).name=name;state.dmaPlanForm=null;persistTopologyStore();}
        else{const created=window.DMAPlans.create(bucket,name,bucket.items.find(p=>p.id===form.source));state.dmaPlanId=created.id;state.dmaPlanForm=null;state.dmaEnterEdit=true;persistTopologyStore();navigate('p07');return;}}
        catch(error){showToast(error.message,'warning');return;}
      }
      if(action==='dma-plan-open'||action==='dma-plan-edit'){state.dmaPlanId=id;state.dmaEnterEdit=action==='dma-plan-edit';navigate('p07');return;}
      if(action==='dma-plan-compare'){state.dmaCompareA=bucket.activeId;state.dmaCompareB=id;state.dmaCompareZone=null;navigate('p06compare');return;}
      if(action==='dma-plan-focus'){state.dmaCompareZone=id;state.dmaCompareHidden=[];}
      if(action==='dma-plan-layer'){const hidden=state.dmaCompareHidden||[];state.dmaCompareHidden=hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id];}
      if(action==='dma-plan-activate')state.dmaActivate=id;
      if(action==='dma-plan-activate-confirm'){
        try{const base=topologyEditor().s.saved,chosen=bucket.items.find(p=>p.id===state.dmaActivate);
          liveTopologyEditor.validate({...base,zones:chosen.zones});window.DMAPlans.activate(bucket,chosen.id,base);state.dmaActivate=null;persistTopologyStore();showToast('在用分区方案已切换');}
        catch(error){showToast(error.message,'warning');return;}
      }
      render();return;
    }
    if(action==='actual-compare-reset'){state.p08Selected=null;render();return;}
    if(action==='history-monitor-locate'){
      const id=target.dataset.value,m=topologyReadModel.monitors.find(m=>m.id===id);if(!m)return;
      state.p10Selected=id;state.p10Drawer=true;state.p10Layers[m.type]=true;navigate('p10');return;
    }
    if(action==='dma-leakage-trend'){
      standardProduct().openAnalysis(target.dataset.value,dmaSelectedMonth(),target.dataset.metric||'comparison');navigate('leakage');return;
    }
    if (action === 'save-dma-metadata') {
      try {
        saveDmaMetadata(target.dataset.value, { name: document.getElementById('dmaZoneName')?.value });
        render();
        showToast('分区名称已保存');
      } catch (error) { showToast(error.message, 'warning'); }
      return;
    }
    if(action==="current-object-locate"){
      const id=target.dataset.value,o=topologyReadModel.objects.get(id);if(!o)return;
      state.p02Drawer=(o.type==="pipe"?"pipe:":"asset:")+id;state.p02SelectedObjects=[id];state.p02FocusedNode=id;
      navigate("p02asset");return;
    }
    if(action==="actual-compare-object"){state.p08Selected=target.dataset.value;render();return;}
    const value = target.dataset.value;
    if(action==='open-dma-members'){navigate('p07');const editor=topologyEditor();editor.s.selected=value;editor.fit([value]);render();return;}
    const mutations=["edit-tool","split-pipe","confirm-split","merge-node","confirm-merge","save-edit","undo","redo"];
    if(state.page==="p04" && mutations.includes(action) && selectedTopology()?.status!=="编辑中"){showToast("已发布版本不可修改，请基于此创建编辑版本","warning");return;}
    if(action.startsWith("topology-") || ["binding-object","binding-metric","binding-save","binding-cancel"].includes(action)){handleTopologyAction(action,value);return;}
    switch (action) {
      case "toggle-primary-nav": {
        const sameGroup = state.navGroup === value;
        state.navGroup = value;
        state.navDrawerOpen = sameGroup ? !state.navDrawerOpen : true;
        renderNav();
        break;
      }
      case "close-nav-drawer": state.navDrawerOpen = false; renderNav(); break;
      case "toggle-message-center": state.messageCenterOpen = !state.messageCenterOpen; renderMessageCenter(); break;
      case "close-message-center": state.messageCenterOpen = false; renderMessageCenter(); break;
      case "mark-all-messages-read": state.messageRead = messageCenterItems.map(item => item.id); renderMessageCenter(); break;
      case "open-message": {
        const messageId = target.dataset.messageId;
        const messageType = target.dataset.messageType;
        const destination = target.dataset.messageTarget;
        const messageValue = target.dataset.messageValue;
        if (!state.messageRead.includes(messageId)) state.messageRead.push(messageId);
        state.messageCenterOpen = false;
        if(['workorder','alarm'].includes(messageType)){operations().open(messageType==='alarm'?'p13':'p15',messageValue);break;}
        if (messageType === "workorder") {
          state.p02Drawer = p02DrawerRef("workorder", messageValue);
          state.p02DrawerTab = "basic";
          state.p02SelectedObjects = [messageValue];
        } else if (messageType === "alarm") {
          state.p13Selected = true;
        } else if (destination === "p02dma") {
          state.p02Drawer = p02DrawerRef("dma", messageValue);
          state.p02DrawerTab = "metrics";
          state.p02SelectedObjects = [messageValue];
        } else if (destination === "p05") {
          state.p05Issue = messageValue;
        } else if (destination === "p14") {
          state.p14Filter = messageValue;
        }
        navigate(destination);
        break;
      }
      case "open-projects": state.messageCenterOpen = false; navigate("projects"); break;
      case "logout": state.authenticated = false; state.account=null; state.activeProjectId = null; state.modal = null; state.messageCenterOpen = false; navigate("login"); break;
      case "enter-project": state.activeProjectId = target.dataset.projectId; state.p02Drawer = null; state.timeMode = "REALTIME"; navigate(isCampusProject()?"p02dma":"p02",true); showToast(`已进入${activeProject().name}`); break;
      case "project-search": state.projectQuery = document.getElementById("projectSearchInput").value; render(); break;
      case "project-reset": state.projectQuery = ""; render(); break;
      case "create-project": state.editingProjectId = null; openModal("project-create"); break;
      case "edit-project": state.editingProjectId = target.dataset.projectId; openModal("project-edit"); break;
      case "delete-project": state.editingProjectId = target.dataset.projectId; openModal("project-delete"); break;
      case "confirm-project-save": saveProject(); break;
      case "confirm-project-delete": {
        const deleted = state.projects.find(project => project.id === state.editingProjectId);
        state.projects = state.projects.filter(project => project.id !== state.editingProjectId);
        if (state.activeProjectId === state.editingProjectId) state.activeProjectId = null;
        state.modal = null;
        state.editingProjectId = null;
        render();
        showToast(`${deleted ? deleted.name : "项目"}已删除`, "warning");
        break;
      }
      case "refresh": showToast("数据已刷新，更新时间 14:32:18"); break;
      case "flow-monitor": state.p10Type = "flow"; navigate("p10"); break;
      case "volume-trend": state.p11Range = "24h"; navigate("p11"); break;
      case "worst-pressure": state.p02Drawer = p02DrawerRef("monitor", "P-032"); state.p02DrawerTab = "metrics"; state.p02SelectedObjects = ["P-032"]; navigate("p02"); break;
      case "low-pressure": state.p02Drawer = p02DrawerRef("monitor", "P-032"); state.p02DrawerTab = "metrics"; state.p02SelectedObjects = ["P-032"]; navigate("p02"); showToast("已应用低压点筛选：5 个对象", "warning"); break;
      case "water-quality": state.p10Type = "quality"; navigate("p10"); break;
      case "dma-abnormal": state.p02Drawer = p02DrawerRef("dma", "DMA-城东-02"); state.p02DrawerTab = "metrics"; state.p02SelectedObjects = ["DMA-城东-02"]; navigate("p02dma"); showToast("已定位 DMA 异常分区", "warning"); break;
      case "open-ops-events":
        navigate("p02");
        state.p02BottomTabs.operations = "events";
        state.p02BottomPage = 1;
        state.p02BottomOpen = true;
        render();
        break;
      case "select-pipe": {
        const pipeId = target.dataset.pipeId || value || "PIPE-2026-003";
        if (isP02Page()) {
          if (state.p02Tool === "multi") state.p02SelectedObjects = state.p02SelectedObjects.includes(pipeId) ? state.p02SelectedObjects.filter(item => item !== pipeId) : [...state.p02SelectedObjects, pipeId];
          else state.p02SelectedObjects = [pipeId];
          state.p02Drawer = p02DrawerRef("pipe", pipeId);
          state.p02DrawerTab = "basic";
          if (state.p02Tool !== "multi") state.p02Tool = "select";
          state.p02SelectionShape = null;
          state.p02FullExtent = false;
          render();
        } else {
          state.p02Drawer = p02DrawerRef("pipe", pipeId);
          state.p02DrawerTab = "basic";
          state.p02SelectedObjects = [pipeId];
          navigate("p02asset");
        }
        break;
      }
      case "select-worst": state.p02Drawer = p02DrawerRef("monitor", value || "P-032"); state.p02DrawerTab = "metrics"; state.p02SelectedObjects = [value || "P-032"]; state.p02Tool = "select"; if (isP02Page()) render(); else showToast("已定位 P-032 城南末梢压力点", "warning"); break;
      case "select-monitor": {
        state.p10UserSelected=null;
        const monitorId = value || "Q-001";
        if (state.page === "p10h") { state.historySelection.data = monitorId; render(); break; }
        if (isP02Page()) {
          state.p02Drawer = p02DrawerRef("monitor", monitorId);
          state.p02DrawerTab = "basic";
          state.p02SelectedObjects = state.p02Tool === "multi" && !state.p02SelectedObjects.includes(monitorId) ? [...state.p02SelectedObjects, monitorId] : [monitorId];
          if (state.p02Tool !== "multi") state.p02Tool = "select";
          state.p02SelectionShape = null;
          state.p02FullExtent = false;
          render();
          showToast(`已定位监测点 ${monitorId}`);
        } else { state.p10Drawer = true; state.p10Selected = monitorId; render(); showToast(`已定位监测点 ${monitorId}，并加载值、时间与质量码`); }
        break;
      }
      case "select-map-alarm": if (state.page === "p13h") { state.historySelection.alarm = value || "ALM-032"; render(); } else { state.p02Drawer = p02DrawerRef("alarm", value || "ALM-032"); state.p02DrawerTab = "basic"; state.p02SelectedObjects = [value || "ALM-032"]; state.p02Tool = "select"; render(); } break;
      case "select-workorder": if (state.page === "p15h") { state.historySelection.work = value || "WO-2026-083"; render(); } else { state.p02Drawer = p02DrawerRef("workorder", value || "WO-2026-083"); state.p02DrawerTab = "basic"; state.p02SelectedObjects = [value || "WO-2026-083"]; state.p02Tool = "select"; if (state.page === "p02" || state.page === "p15") render(); else navigate("p15"); } break;
      case "show-user-monitors": state.p10BottomTab='users';state.p10BottomOpen=true;state.p10BottomPage=1;render();break;
      case "open-user-monitor": state.p10UserSelected=value;state.p10Drawer=false;state.p10BottomOpen=false;if(state.page==='p10')render();else navigate('p10');break;
      case "select-asset": if(state.page==='p10'&&window.WaterUserHierarchy?.eligible(topologyReadModel?.objects.get(value))){state.p10UserSelected=value;state.p10Drawer=false;render();break;} state.p02Drawer = p02DrawerRef("asset", value || "PLANT-001"); state.p02DrawerTab = "basic"; state.p02SelectedObjects = [value || "PLANT-001"]; state.p02Tool = "select"; if (state.page === "p02asset") render(); else navigate("p02asset"); break;
      case "ack-map-alarm": operations().open("p13",String(state.p02Drawer||"").split(":")[1]); break;
      case "create-map-workorder": state.p02WorkorderStatus = "待派单"; state.p02Drawer = p02DrawerRef("workorder", "WO-2026-083"); state.p02DrawerTab = "basic"; state.p02SelectedObjects = ["WO-2026-083"]; render(); showToast("已创建工单 WO-2026-083"); break;
      case "create-workorder-center": state.p02WorkorderStatus = "待派单"; state.p02Drawer = p02DrawerRef("workorder", "WO-2026-083"); state.p02DrawerTab = "basic"; state.p02SelectedObjects = ["WO-2026-083"]; navigate("p02"); showToast("已创建工单 WO-2026-083"); break;
      case "workorder-query": showToast("已按当前条件查询工单"); break;
      case "workorder-reset": showToast("工单查询条件已重置"); break;
      case "create-inspection": showToast("巡检计划 INS-2026-122 已创建"); break;
      case "process-map-workorder": operations().open("p15",String(state.p02Drawer||"").split(":")[1]); break;
      case "export-assets": showToast("资产台账已按当前图层条件导出"); break;
      case "export-topology": showToast(`已导出拓扑：${value}`); break;
      case "standard-device-data": navigate("devices"); standardProduct().action("data",value); break;
      case "view-trend": state.trendMonitor=String(state.p02Drawer||'').split(':').slice(1).join(':'); navigate("p11"); break;
      case "open-monitor-trend": state.trendMonitor=value; navigate("p11"); break;
      case "toggle-table-columns": state.tableColumnPanel = state.tableColumnPanel === value ? null : value; render(); break;
      case "close-drawer": state.p02Drawer = null; render(); break;
      case "locate-node": {
        const nodeId = value || "J-04";
        state.p02FocusedNode = nodeId;
        state.p02Drawer = p02DrawerRef("node", nodeId);
        state.p02DrawerTab = "basic";
        state.p02SelectedObjects = [nodeId];
        render();
        showToast(`已定位 ${nodeId}`);
        break;
      }
      case "upstream": state.p02SelectedObjects = ["PIPE-2026-002", "PIPE-2026-010", "PIPE-2026-013", "PIPE-2026-014"]; render(); showToast("已高亮上游 2 条、下游 4 条关联管线"); break;
      case "p02-tab": state.p02Tab = value; render(); break;
      case "p02-bottom-tab": state.p02BottomTabs[p02ViewFromPage()] = value; state.p02BottomPage = 1; state.p02BottomOpen = true; render(); break;
      case "toggle-p02-bottom": state.p02BottomOpen = !state.p02BottomOpen;  render(); break;
      case "toggle-layer-drawer": {
        if (state.page === "p10") {
          state.p10LayerOpen = !state.p10LayerOpen;

          if (!state.p10LayerOpen) state.layerStyleEditor = null;
        } else {
          state.p02LayerOpen = !state.p02LayerOpen;

          if (!state.p02LayerOpen) state.layerStyleEditor = null;
        }
        render();
        break;
      }
      case "open-layer-style": state.layerStyleEditor = { context: target.dataset.styleContext, layer: target.dataset.styleLayer }; render(); break;
      case "close-layer-style": state.layerStyleEditor = null; render(); break;
      case "add-pipe-class": {
        const context = target.dataset.styleContext;
        const config = state.pipeClassifications[context];
        const palette = ["#13c2c2", "#52c41a", "#eb2f96", "#2f54eb"];
        if (config.field === "material") config.values.push(`其他管材 ${config.values.length + 1}`);
        else {
          const last = config.breaks[config.breaks.length - 1] || 0;
          config.breaks.push(last + (config.field === "age" ? 10 : 200));
        }
        config.colors.push(palette[(config.colors.length - 4) % palette.length]);
        state.pipeClassHidden[context] = [];
        render();
        showToast(config.field === "material" ? "已新增管材分类" : "已新增分类区间");
        break;
      }
      case "remove-pipe-class": {
        const context = target.dataset.styleContext;
        const config = state.pipeClassifications[context];
        const index = Number(target.dataset.classIndex);
        const count = pipeClassificationDefinitions(config).length;
        if (count <= 2) break;
        if (config.field === "material") config.values.splice(index, 1);
        else config.breaks.splice(Math.min(index, config.breaks.length - 1), 1);
        config.colors.splice(index, 1);
        state.pipeClassHidden[context] = [];
        render();
        showToast("已删除分类并合并相邻范围");
        break;
      }
      case "reset-layer-style": {
        const context = target.dataset.styleContext;
        const layer = target.dataset.styleLayer;
        const defaults = createMapLayerStyle();
        if (layer === "pipes") {
          state.pipeClassifications[context] = createPipeClassification();
          state.pipeClassHidden[context] = [];
        }
        else if (layer === "dma") {
          try {
            p02DmaCatalog.forEach((dma, i) => saveDmaMetadata(dma.id, { color: createDmaZoneColors()[dma.id] || ["#3997bf", "#46a895", "#8c9dd2", "#d0a15c"][i % 4] }));
          } catch (error) { showToast(error.message, 'warning'); break; }
        }
        else if (layer === "labels") state.mapLayerStyles[context].labels = defaults.labels;
        else state.mapLayerStyles[context].points[layer] = defaults.points[layer];
        render();
        showToast(`${layerStyleLabel(layer)}样式已恢复默认`);
        break;
      }
      case "reset-bottom-query": state.p02SearchQuery = ""; state.p02SearchExecuted = false; state.p02BottomPage = 1; render(); break;
      case "p02-drawer-tab": state.p02DrawerTab = value === "topology" ? "basic" : value; render(); break;
      case "map-view": {
        const camera=window.WaterMapViewport?.get(workspace.querySelector('.product-gis-map .unified-topology-svg'));if(camera){state.p02FullExtent=false;state.p02SelectionShape=null;value==='reset'?camera.reset():camera.zoom(value==='zoom-in'?.8:1.25);break;}

        const zoomKey = /^(p06h|p10h|p13h|p15h)$/.test(state.page) ? "historyZoom" : isP02Page() ? "p02Zoom" : "p10Zoom";
        if (value === "reset") state[zoomKey] = 100;
        if (value === "zoom-in") state[zoomKey] = Math.min(160, state[zoomKey] + 10);
        if (value === "zoom-out") state[zoomKey] = Math.max(60, state[zoomKey] - 10);
        state.p02FullExtent = false;
        state.p02SelectionShape = null;
        render();
        break;
      }
      case "map-tool": {
        state.p02Tool = value;
        state.p02FullExtent = false;
        state.p02SelectionShape = ["box", "polygon", "distance", "area"].includes(value) ? value : null;
        if (value === "box") state.p02SelectedObjects = ["PIPE-2026-003", "PIPE-2026-009", "P-032", "Q-032", "WQ-032"];
        if (value === "polygon") state.p02SelectedObjects = ["PIPE-2026-009", "PIPE-2026-010", "PIPE-2026-013", "PIPE-2026-014", "P-032", "Q-032", "WQ-032"];
        render();
        if (value === "box" || value === "polygon") showToast(`${value === "box" ? "框选" : "多边形"}完成，已高亮 ${state.p02SelectedObjects.length} 个对象`);
        if (value === "distance") showToast("测距完成：1.26 km");
        if (value === "area") showToast("测面积完成：2.84 km²");
        break;
      }
      case "polygon": state.p02Tool = "polygon"; state.p02SelectionShape = "polygon"; render(); break;
      case "full-extent": {const camera=window.WaterMapViewport?.get(workspace.querySelector('.product-gis-map .unified-topology-svg'));if(camera){camera.reset();break;}}state.p02Tool = "select"; state.p02SelectionShape = null; state.p02FullExtent = true; render(); showToast("已定位当前项目全部管网对象"); break;
      case "clear-map": state.p02Drawer = null; state.p02SelectedObjects = []; state.p02SelectionShape = null; state.p02FocusedNode = null; state.p02FullExtent = false; state.p02Tool = "select"; render(); break;
      case "search-object": {
        const searchInput = document.getElementById("p02SearchInput");
        state.p02SearchQuery = searchInput ? searchInput.value : "";
        state.p02SearchExecuted = true;
        state.p02BottomPage = 1;
        render();
        const count = document.querySelectorAll(".product-gis-bottom tbody tr").length;
        showToast(count ? `找到 ${count} 个匹配对象` : "未找到匹配对象", count ? "success" : "warning");
        break;
      }
      case "global-search": state.p02BottomOpen = true; state.p02SearchExecuted = false; state.p02BottomPage = 1; render(); break;
      case "save-selection": {
        if (!state.p02SelectedObjects.length) { showToast("请先选择管线、监测点或 DMA 分区", "warning"); break; }
        const savedId = `SET-${String(state.p02SavedSelections.length + 1).padStart(2, "0")}`;
        state.p02SavedSelections.push({ id: savedId, name: `运行选择集 ${String(state.p02SavedSelections.length + 1).padStart(2, "0")}`, objects: [...state.p02SelectedObjects] });
        state.p02BottomOpen = true;
        render();
        showToast(`已保存 ${state.p02SelectedObjects.length} 个对象`);
        break;
      }
      case "toggle-p02-tree": state.p02ExpandedTree = state.p02ExpandedTree.includes(value) ? state.p02ExpandedTree.filter(item => item !== value) : [...state.p02ExpandedTree, value]; render(); break;
      case "select-dma": {
        const dma = findDma(value);
        if (!dma) break;
        if (state.page === "p06h") { state.historySelection.dma = dma.id; render(); break; }
        state.p02Drawer = p02DrawerRef("dma", dma.id);
        state.p02DrawerTab = "basic";
        state.p02SelectedObjects = [dma.id];
        state.p02SelectionShape = null;
        state.p02FullExtent = false;
        state.p02Tool = "select";
        if (state.page !== "p02dma") navigate("p02dma");
        if (dmaChildren(dma.id).length) {
          state.p02DmaFocus = dma.id;
          render();
          showToast(`已进入 ${dma.id.replace("DMA-", "")} 的下一级分区`);
        } else render();
        break;
      }
      case "dma-root": state.p02DmaFocus = null; state.p02Drawer = null; state.p02SelectedObjects = []; render(); break;
      case "dma-focus": state.p02DmaFocus = value; state.p02Drawer = p02DrawerRef("dma", value); state.p02SelectedObjects = [value]; render(); break;
      case "dma-up": {
        const current = findDma(state.p02DmaFocus);
        state.p02DmaFocus = current ? current.parent : null;
        state.p02Drawer = current?.parent ? p02DrawerRef("dma", current.parent) : null;
        state.p02SelectedObjects = current?.parent ? [current.parent] : [];
        render();
        break;
      }
      case "select-saved-set": {
        const saved = state.p02SavedSelections.find(item => item.id === value);
        if (saved) { state.p02SelectedObjects = [...saved.objects]; state.p02Drawer = saved.objects[0] ? (saved.objects[0].startsWith("PIPE") ? p02DrawerRef("pipe", saved.objects[0]) : saved.objects[0].startsWith("DMA") ? p02DrawerRef("dma", saved.objects[0]) : p02DrawerRef("monitor", saved.objects[0])) : null; state.p02DrawerTab = "basic"; render(); }
        break;
      }
      case "open-map-event": state.p02Drawer = p02DrawerRef("monitor", value); state.p02DrawerTab = "history"; state.p02SelectedObjects = [value]; state.p02Tool = "select"; render(); break;
      case "collapse-left": state.p02LeftCollapsed = !state.p02LeftCollapsed; render(); showToast(state.p02LeftCollapsed ? "已收起左侧图层面板" : "已展开左侧图层面板"); break;
      case "derive-topology": handleTopologyAction("topology-copy",activeTopology()?.id); break;
      case "create-topology": handleTopologyAction("topology-new"); break;
      case "confirm-derive": state.modal=null;handleTopologyAction("topology-new");break;
      case "delete-draft": showToast("删除草稿前需完成二次确认", "warning"); break;
      case "split-pipe": openModal("split-pipe"); break;
      case "confirm-split": state.modal = null; state.p04SplitDone = true; state.p04Dirty = true; render(); showToast("分割预览已生成，待保存", "warning"); break;
      case "merge-node": openModal("merge-node"); break;
      case "confirm-merge": state.modal = null; state.p04Dirty = true; render(); showToast("节点合并已加入本次变更集", "warning"); break;
      case "save-edit": state.p04Dirty = false; render(); showToast("变更集已事务化保存，可继续编辑"); break;
      case "run-check": if (state.p04Dirty) showToast("请先保存未提交变更", "warning"); else runCheckAndNavigate(); break;
      case "run-check-now": if (state.p04Dirty) showToast("存在未保存的拓扑变更，请先保存后再检查", "warning"); else runCheckAndNavigate(); break;
      case "undo": case "redo": showToast(action === "undo" ? "已撤销上一步" : "已重做上一步"); break;
      case "p04-toolbox": state.p04Toolbox = value === "check" ? "check" : "edit"; render(); break;
      case "save-selection-set": showToast(`${p05SelectedIssue()?.objectId || "当前问题"} 已保存为选择集`); break;
      case "p05-category": {
        state.p05Category = value;
        state.p05Issue = p05VisibleIssues(value)[0]?.id || null;
        render();
        break;
      }
      case "island-filter": state.p05Category = "island"; state.p05Issue = p05VisibleIssues("island")[0]?.id || null; render(); break;
      case "select-issue": {
        const issue = topologyCheckIssues.find(item => item.id === value);
        if (issue) { state.p05Category = issue.category; state.p05Issue = issue.id; render(); showToast(`已缩放并高亮 ${issue.objectId}`); }
        break;
      }
      case "toggle-island-selection": {
        if (selectedTopology()?.status !== "编辑中") { showToast("只读拓扑不可删除，请先基于此创建编辑版本", "warning"); break; }
        if (state.p05SelectedIslands.includes(value)) state.p05SelectedIslands = state.p05SelectedIslands.filter(id => id !== value);
        else state.p05SelectedIslands.push(value);
        render();
        break;
      }
      case "delete-selected-islands": if (state.p05SelectedIslands.length && selectedTopology()?.status === "编辑中") openModal("delete-islands"); break;
      case "confirm-delete-islands": {
        if (selectedTopology()?.status !== "编辑中") { state.modal = null; render(); showToast("当前拓扑不可编辑，未执行批量删除", "warning"); break; }
        const selected = state.p05SelectedIslands.filter(id => !state.p05DeletedIslands.includes(id));
        state.p05DeletedIslands.push(...selected);
        state.p05SelectedIslands = [];
        state.p04Dirty = true;
        state.modal = null;
        state.p05Issue = p05VisibleIssues("island")[0]?.id || null;
        render();
        showToast(`已将 ${selected.length} 个孤岛加入批量删除变更集`, "warning");
        break;
      }
      case "create-dma": case "derive-dma": state.p07Step = 0; navigate("p07"); break;
      case "create-l1": openModal("create-l1"); break;
      case "confirm-l1": state.modal = null; state.p07Step = 1; render(); showToast("一级选择集已形成，边界状态 DIRTY", "warning"); break;
      case "create-child": state.p07Step = Math.max(state.p07Step, 1); render(); showToast("已锁定父级外对象，可创建二级 DMA"); break;
      case "recompute-boundary": state.p07Step = 2; render(); showToast("已识别 6 个 Boundary Connection"); break;
      case "generate-virtual": state.p07Step = 3; render(); showToast("已生成 6 个 VFM 与 6 个 VPS 虚拟监测点"); break;
      case "save-dma": showToast("DMA 方案已保存"); break;
      case "validate-dma": showToast("校验完成：2 个监测缺口", "warning"); break;
      case "unassigned": showToast("已高亮未分配 92 根管线，共 13.7 km", "warning"); break;
      case "boundary-detail": showToast("地图已仅显示 6 个边界连接"); break;
      case "select-virtual": showToast("VFM-006：当前无真实数据，后续作为水力模型数据源"); break;
      case "diff-filter": state.p08Filter = value; render(); showToast(value === "ALL" ? "已显示全部差异对象" : `已筛选 ${value} 差异对象`); break;
      case "select-diff": state.p08Selected = value; render(); showToast(`已同步定位并高亮 ${value} 的 A/B 几何`); break;
      case "select-compare-object": state.p08Selected = value || target.dataset.pipeId; render(); break;
      case "close-compare-object": state.p08Selected = null; render(); break;
      case "attr-mode": state.p08AllFields = value === "all"; render(); break;
      case "swap-compare": showToast("已交换基准与比较对象，变化方向同步反转"); break;
      case "run-topology-compare": showToast("对比任务已完成，共发现 271 条差异"); break;
      case "compare-data-tab": state.compareDataType = value; render(); break;
      case "run-data-compare": showToast("对比数据已按当前版本重新计算"); break;
      case "apply-map-date": {
        const range = state.mapDateRanges[value];
        if (!range) break;
        if (range.start > range.end) { showToast("开始日期不能晚于结束日期", "warning"); break; }
        range.appliedStart = range.start;
        range.appliedEnd = range.end;
        render();
        showToast(`已加载 ${range.appliedStart} 至 ${range.appliedEnd} 的专题数据`);
        break;
      }
      case "apply-history-date": {
        const historyConfig = historyMapConfigs[value];
        const range = historyConfig && state.mapDateRanges[historyConfig.range];
        if (!range) break;
        if (range.start > range.end) { showToast("开始日期不能晚于结束日期", "warning"); break; }
        if (!range.start || !range.end) { showToast("请选择完整日期范围", "warning"); break; }
        if (range.end >= "2026-09-08") { showToast("历史记录不包含今日数据，请在当前业务页查看今日状态", "warning"); break; }
        range.appliedStart = range.start;
        range.appliedEnd = range.end;
        render();
        state.historyPage = 1;
        showToast(`已从历史归档库加载 ${range.appliedStart} 至 ${range.appliedEnd} 的记录`);
        break;
      }
      case "history-select": {
        const kind = target.dataset.historyKind || ({ p06h: "dma", p10h: "data", p13h: "alarm", p15h: "work" }[state.page]);
        if (kind) { state.historySelection[kind] = value; render(); }
        break;
      }
      case "close-history-detail": state.historySelection[value] = null; render(); break;
      case "toggle-history-bottom": state.historyBottomOpen = !state.historyBottomOpen; render(); break;
      case "history-query": state.historyQuery = document.getElementById("historySearch").value.trim(); state.historyType = document.getElementById("historyType").value; state.historyPage = 1; render(); break;
      case "history-page": state.historyPage = Number(value); render(); break;
      case "history-reset": state.historyQuery = ""; state.historyType = ""; state.historyPage = 1; render(); break;
      case "diameter-filter": state.p08Filter = "ATTRIBUTE"; render(); showToast("已增加筛选：DN500 且管长净增"); break;
      case "export-report": showToast("已生成当前筛选条件下的对比报告"); break;
      case "select-dma-match": state.p09Selected = "DMA-A03"; state.p09Boundary = false; render(); break;
      case "removed-boundary": state.p09Boundary = true; render(); showToast("已过滤 3 个取消边界并定位 Boundary-03"); break;
      case "back-dma-detail": state.p09Boundary = false; render(); break;
      case "run-dma-compare": showToast("DMA 对比已完成，跨拓扑匹配可信度 92%"); break;
      case "set-realtime": setTimeMode("REALTIME"); break;
      case "set-history": setTimeMode("HISTORY"); break;
      case "close-p10-detail": state.p10UserSelected=null;state.p10Drawer=false; render(); break;
      case "toggle-p10-bottom": state.p10BottomOpen = !state.p10BottomOpen;  render(); break;
      case "p10-bottom-tab": state.p10BottomTab = value; state.p10BottomPage = 1; state.p10BottomOpen = true; render(); break;
      case "p10-status": state.p10Status = value; state.p10BottomPage = 1; render(); break;
      case "p10-search": state.p10Query = document.getElementById("p10SearchInput")?.value || ""; state.p10BottomPage = 1; render(); break;
      case "p10-reset": state.p10Query = ""; state.p10Status = "all"; state.p10BottomPage = 1; render(); break;
      case "bottom-page": {
        const pageKey = target.dataset.paginationScope === "p10" ? "p10BottomPage" : "p02BottomPage";
        state[pageKey] = Number(value) || 1;
        render();
        break;
      }
      case "trend-range": state.p11Range = value; render(); showToast(`已加载最近 ${value} 趋势`); break;
      case "open-binding": state.p12Mode = "binding"; state.p12Candidate = null; render(); break;
      case "binding-back": state.p12Mode = "list"; render(); break;
      case "select-candidate": if (value.startsWith("PIPE")) showToast("设备类型与候选对象类型不匹配", "error"); else { state.p12Candidate = value; render(); } break;
      case "confirm-binding": openModal("bind"); break;
      case "confirm-binding-save": state.modal = null; state.p12Mode = "list"; state.p12Bound = true; render(); showToast("新 Binding 已生效，旧绑定有效期已关闭"); break;
      case "open-alarm": state.p13Selected = true; render(); break;
      case "close-alarm": state.p13Selected = false; render(); break;
      case "alarm-ack": state.p13Status = "ACKNOWLEDGED"; render(); showToast("报警已确认，确认人：张调度"); break;
      case "alarm-process": state.p13Status = "PROCESSING"; render(); showToast("报警已进入处理中状态"); break;
      case "quality-filter": state.p14Filter = value; render(); showToast("已筛选延迟设备并联动 GIS"); break;
      case "modal-close": state.modal = null; renderModal(); break;
      default: break;
    }
  }

  function runCheckAndNavigate() {
    state.p05Running = false;
    state.p04Toolbox = "check";
    navigate("p04");
    showToast(`拓扑检查完成：发现 ${topologyEditor().issues().length} 个问题`);
  }

  function setTimeMode(mode) {
    state.timeMode = mode;
    const button = document.getElementById("timeModeButton");
    const text = document.getElementById("timeModeText");
    const globalTime = document.getElementById("globalTime");
    button.className = `product-context-button ${mode === "REALTIME" ? "is-realtime" : "is-history"}`;
    text.textContent = mode === "REALTIME" ? "实时" : "历史";
    globalTime.textContent = mode === "REALTIME" ? "更新时间 14:32:18" : "2026-09-01 14:00:00";
    render();
    showToast(mode === "REALTIME" ? "已恢复自动刷新" : "已切换历史时间点，地图停止自动刷新", mode === "REALTIME" ? "success" : "warning");
  }

  document.addEventListener("click", event => {
    if (state.navDrawerOpen && !event.target.closest(".product-sidebar")) {
      state.navDrawerOpen = false;
      renderNav();
    }
    const pageTarget = event.target.closest("[data-page]");
    if (pageTarget) {
      navigate(pageTarget.dataset.page, Boolean(pageTarget.closest("#navDrawer")));
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
  });

  document.addEventListener('keydown',event=>{
    const zone=event.target.closest('[data-action="dma-plan-focus"]');
    if(zone&&['Enter',' '].includes(event.key)&&zone.tagName.toLowerCase()!=='button'){event.preventDefault();handleAction('dma-plan-focus',zone);return;}
    const object=event.target.closest('[data-action="actual-compare-object"]');
    if(object&&['Enter',' '].includes(event.key)&&object.tagName.toLowerCase()!=='button'){event.preventDefault();handleAction('actual-compare-object',object);}
  });

  document.addEventListener("submit", event => {
    if (event.target.matches('[data-action="login-submit"]')) {
      event.preventDefault();
      submitLogin();
    }
  });

  document.addEventListener("change", event => {
    if(event.target.id==='dmaStatMonth'){
      const month=event.target.value;
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){event.target.value=dmaSelectedMonth();return;}
      state.dmaMonths ||= {};state.dmaMonths[state.activeProjectId+'|'+state.selectedTopology]=month;render();return;
    }
    if(event.target.id==='dmaEditorPlan'){
      if(liveTopologyEditor?.s.dirty){showToast('请先保存或撤销当前方案变更','warning');event.target.value=state.dmaPlanId||dmaPlan().id;return;}
      state.dmaPlanId=event.target.value;render();return;
    }
    if(event.target.id==='dmaCompareA'||event.target.id==='dmaCompareB'){state[event.target.id]=event.target.value;state.dmaCompareZone=null;state.dmaCompareHidden=[];render();return;}
    if(event.target.id==="actualCompareBaseline" || event.target.id==="actualCompareCurrent"){
      if(event.target.id==="actualCompareBaseline")state.compareBaseline=event.target.value;
      else state.selectedTopology=event.target.value;
      state.p08Selected=null;render();return;
    }
    if(event.target.id==="topologyViewSelect"){
      state.selectedTopology=event.target.value;
      state.p02Drawer=null;state.p02SelectedObjects=[];state.p02DmaFocus=null;state.p02SearchQuery="";state.p02SearchExecuted=false;state.p02Zoom=100;state.p10Zoom=100;state.p02FocusedNode=null;state.bindingDraft=null;state.p08Selected=null;
      render();return;
    }
    if(event.target.matches("[data-binding-device]")){
      const draft=bindingConfig(),id=event.target.dataset.bindingDevice;
      draft.devices=event.target.checked?[...new Set([...draft.devices,id])]:draft.devices.filter(d=>d!==id);state.bindingMessage="配置未保存";render();
    }
    if(event.target.matches("[data-binding-rule]")){bindingConfig().rule=event.target.value;state.bindingMessage="配置未保存";render();}
    if (event.target.id === "projectProvinceInput") updateProjectCities();
    if (event.target.id === "projectCityInput") updateProjectDistricts();
    if (event.target.matches("[data-p02-layer]")) {
      const view = event.target.dataset.p02View || p02ViewFromPage();
      state.p02LayersByView[view][event.target.dataset.p02Layer] = event.target.checked;
      render();
    }
    if (event.target.matches("[data-map-date]")) {
      const range = state.mapDateRanges[event.target.dataset.dateContext];
      if (range) range[event.target.dataset.dateField] = event.target.value;
    }
    if (event.target.matches("[data-history-layer]")) {
      const kind = event.target.dataset.historyKind;
      state.historyLayers[kind][event.target.dataset.historyLayer] = event.target.checked;
      render();
    }
    if (event.target.matches("[data-history-page-size]")) {
      state.historyPageSize = Number(event.target.value) || 10;
      render();
    }
    if (event.target.matches("[data-compare-map-type]")) {
      state.compareMapType = event.target.value;
      state.p08Filter = "ALL";
      state.p08Selected = null;
      render();
    }
    if (event.target.matches("[data-p02-bottom-sort]")) { state.p02BottomSort = event.target.value; state.p02BottomPage = 1; render(); }
    if (event.target.matches("[data-p10-layer]")) { state.p10Layers[event.target.dataset.p10Layer] = event.target.checked; render(); }
    if (event.target.matches("[data-pipe-class-visible]")) {
      const context = event.target.dataset.styleContext;
      const index = Number(event.target.dataset.classIndex);
      const hidden = state.pipeClassHidden[context];
      if (event.target.checked) state.pipeClassHidden[context] = hidden.filter(item => item !== index);
      else if (!hidden.includes(index)) hidden.push(index);
      render();
    }
    if (event.target.matches("[data-pipe-class-field]")) {
      const context = event.target.dataset.styleContext;
      state.pipeClassifications[context] = createPipeClassification(event.target.value);
      state.pipeClassHidden[context] = [];
      render();
    }
    if (event.target.matches("[data-pipe-class-boundary]")) {
      const context = event.target.dataset.styleContext;
      const config = state.pipeClassifications[context];
      const index = Number(event.target.dataset.classIndex);
      const previous = index ? config.breaks[index - 1] + 1 : 1;
      const next = index < config.breaks.length - 1 ? config.breaks[index + 1] - 1 : Number.POSITIVE_INFINITY;
      config.breaks[index] = Math.max(previous, Math.min(next, Number(event.target.value) || previous));
      render();
    }
    if (event.target.matches("[data-pipe-class-color]")) {
      const context = event.target.dataset.styleContext;
      state.pipeClassifications[context].colors[Number(event.target.dataset.classIndex)] = event.target.value;
      render();
    }
    if (event.target.matches("[data-pipe-class-value]")) {
      const context = event.target.dataset.styleContext;
      state.pipeClassifications[context].values[Number(event.target.dataset.classIndex)] = event.target.value.trim() || "未命名分类";
      render();
    }
    if (event.target.matches("[data-dma-zone-color]")) {
      try { saveDmaMetadata(event.target.dataset.dmaId, { color: event.target.value }); }
      catch (error) { showToast(error.message, 'warning'); }
      render();
    }
    if (event.target.matches("[data-map-style-control]")) {
      const context = event.target.dataset.styleContext;
      const type = event.target.dataset.styleType;
      const key = event.target.dataset.styleKey;
      const property = event.target.dataset.styleProperty;
      const config = state.mapLayerStyles[context];
      const targetConfig = type === "line" ? config.lines[key] : type === "point" ? config.points[key] : config.labels;
      targetConfig[property] = property === "color" ? event.target.value : Number(event.target.value);
      if (targetConfig.min > targetConfig.max) {
        if (property === "min") targetConfig.max = targetConfig.min;
        else targetConfig.min = targetConfig.max;
      }
      render();
    }
    if (event.target.matches("[data-p10-bottom-sort]")) { state.p10Sort = event.target.value; state.p10BottomPage = 1; render(); }
    if (event.target.matches("[data-bottom-page-size]")) {
      const isP10 = event.target.dataset.bottomPageSize === "p10";
      state[isP10 ? "p10BottomPageSize" : "p02BottomPageSize"] = Number(event.target.value);
      state[isP10 ? "p10BottomPage" : "p02BottomPage"] = 1;
      render();
    }
    if (event.target.matches("[data-table-column]")) {
      const key = event.target.dataset.tableConfig;
      const columnIndex = Number(event.target.dataset.tableColumn);
      const visibility = state.tableColumnVisibility[key];
      if (!visibility) return;
      visibility[columnIndex] = event.target.checked;
      if (!visibility.some(Boolean)) {
        visibility[columnIndex] = true;
        event.target.checked = true;
        showToast("至少保留一个显示字段", "warning");
        return;
      }
      state.tableColumnPanel = key;
      render();
    }
  });

  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches('.unified-topology-svg [data-action][role="button"]')) {
      event.preventDefault();handleAction(event.target.dataset.action,event.target);return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches('g[data-action="history-select"]')) {
      event.preventDefault();
      handleAction("history-select", event.target);
    }
    if (event.key === "Enter" && event.target.id === "historySearch") {
      event.preventDefault();
      handleAction("history-query", event.target);
    }
    if (event.key === "Escape" && state.navDrawerOpen) {
      state.navDrawerOpen = false;
      renderNav();
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".product-clickable-row")) {
      event.preventDefault();
      handleAction(event.target.dataset.action, event.target);
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".product-dma-zone-label")) {
      event.preventDefault();
      handleAction(event.target.dataset.action || "select-dma", event.target);
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches('[data-action="select-compare-object"]:not(.product-dma-zone-label)')) {
      event.preventDefault();
      handleAction("select-compare-object", event.target);
    }
    if (event.key === "Enter" && event.target.id === "p02SearchInput") {
      event.preventDefault();
      handleAction("search-object", event.target);
    }
    if (event.key === "Enter" && event.target.id === "p10SearchInput") {
      event.preventDefault();
      handleAction("p10-search", event.target);
    }
  });

  document.getElementById("timeModeButton").addEventListener("click", () => showToast(/^(p06h|p10h|p13h|p15h)$/.test(state.page) ? "当前为独立历史归档视图" : "当前业务页固定展示最新数据；历史数据请从对应模块进入"));
  document.getElementById("projectSelect").addEventListener("change", event => {
    if(isSchoolAccount()){event.target.value=window.SchoolAccess.projectId;return;}
    state.activeProjectId = event.target.value;
    state.p02Drawer = null;
    state.timeMode = "REALTIME";
    navigate(isCampusProject()?"p02dma":"p02",isCampusProject());
    showToast(`已切换至${activeProject().name}，并进入${isCampusProject()?'DMA 分区一张图':'运维一张图'}`);
  });
  window.addEventListener("hashchange", () => {
    let page = location.hash.slice(1);
    if (!state.authenticated) { if (page !== "login") location.hash = "login"; return; }
    if(isSchoolAccount()&&!window.SchoolAccess.canPage(page)){navigate(window.SchoolAccess.home);return;}
    if (page === "p05") { state.p04Toolbox = "check"; page = "p04"; history.replaceState(null, "", "#p04"); }
    if ((page === "projects" || renderers[page]) && page !== state.page) { state.page = page; render(); }
  });
  window.addEventListener("water-theme-change", () => initializeLineCharts(document));
  window.addEventListener("resize", () => lineChartInstances.forEach(instance => instance.resize()));

  if (location.hash !== "#login") history.replaceState(null, "", "#login");
  render();
}());
