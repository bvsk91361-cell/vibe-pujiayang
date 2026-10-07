// Original demonstration equipment catalog. One physical entry per stable id.
export const categories=[['camera','相机'],['lens','镜头'],['drone','无人机'],['gimbal','云台相机'],['microphone','麦克风'],['light','灯光'],['projector','投影设备'],['support','三脚架 / 稳定器'],['recorder','音频记录'],['capture','直播 / 采集']].map(([id,name])=>({id,name}));
const rows=[
 ['camera','数码相机','C1','camera','用影像记录每一次灵感',['2400万像素','4K视频','轻便机身'],['新手友好','高画质'],['vlog','experiment'],'imaging',true],
 ['projector','便携投影仪','P1','projector','让作品，在更大的画面里相遇',['1080p','HDMI输入','便携收纳'],['演示常用','轻便'],['presentation'],'projection',true],
 ['recorder','录音笔','R1','recorder','把每一段声音，清晰留下',['双麦收音','USB导出','长时记录'],['新手友好','采访常用'],['interview','experiment'],'audio',true],
 ['camera-c2','视频相机','C2','camera','给长镜头和校园短片更多细节',['4K 60fps','翻转屏','外接收音'],['高画质'],['vlog','live'],'imaging',true],
 ['camera-c3','轻便相机','C3','camera','随身记录，随时开始',['轻便机身','自动对焦','广角拍摄'],['轻便','新手友好'],['vlog'],'imaging',false],
 ['camera-c4','实验记录相机','C4','camera','让过程与结果都有清晰证据',['微距模式','定时拍摄','桌面供电'],['实验记录'],['experiment'],'imaging',false],
 ['lens-l1','广角镜头','L1','lens','为场景留下更多空间',['16–35mm','BL-C卡口','宽广视角'],['广角'],['vlog','experiment'],'lens',true],
 ['lens-l2','人像镜头','L2','lens','让人物成为画面的焦点',['50mm','BL-C卡口','大光圈'],['人物拍摄'],['interview'],'lens',false],
 ['lens-l3','微距镜头','L3','lens','靠近细节，记录实验观察',['90mm','BL-C卡口','近距离对焦'],['实验记录'],['experiment'],'lens',false],
 ['drone-a1','轻便航拍设备','A1','drone','从另一个高度，看见校园',['4K拍摄','轻便折叠','定位悬停'],['轻便','航拍'],['aerial'],'aerial',true],
 ['drone-a2','实验航拍设备','A2','drone','为户外记录增加全景视角',['三轴云台','路线记录','备用电池'],['户外记录'],['aerial','experiment'],'aerial',false],
 ['gimbal-g1','便携云台相机','G1','gimbal','走动的灵感，也能稳稳记录',['三轴增稳','竖屏拍摄','口袋收纳'],['轻便','Vlog推荐'],['vlog'],'stabilized-imaging',true],
 ['gimbal-g2','运动记录相机','G2','gimbal','把移动中的故事记录下来',['防抖模式','广角视野','便携支架'],['运动记录'],['vlog','aerial'],'stabilized-imaging',false],
 ['microphone-m1','无线麦克风套装','M1','microphone','让每一个声音都被听清',['双人收音','USB-C接收','便携充电盒'],['采访常用','轻便'],['interview','vlog'],'microphone',true],
 ['microphone-m2','采访麦克风','M2','microphone','给现场对话一个清晰的声音',['指向收音','3.5mm接口','防风罩'],['采访常用'],['interview'],'microphone',false],
 ['microphone-m3','桌面麦克风','M3','microphone','给直播和分享稳定的收音',['USB接口','桌面支架','监听接口'],['直播常用'],['live'],'microphone',false],
 ['light-f1','便携补光灯','F1','light','让小场景也有好光线',['可调色温','电池供电','冷靴接口'],['轻便'],['vlog','interview'],'lighting',true],
 ['light-f2','双灯创作套装','F2','light','给人物与空间更完整的光线',['双灯配置','亮度调节','灯架配套'],['人物拍摄'],['interview','live'],'lighting',false],
 ['light-f3','柔光面板','F3','light','柔和而均匀的桌面光线',['柔光面板','交流供电','可调支架'],['实验记录'],['experiment','live'],'lighting',false],
 ['projector-p2','教室投影设备','P2','projector','把团队成果清晰呈现',['1080p','HDMI输入','会议场景'],['演示常用'],['presentation'],'projection',false],
 ['projector-p3','轻便投影机','P3','projector','把演示带到更多地方',['便携机身','USB-C视频输入','自动对焦'],['轻便'],['presentation'],'projection',true],
 ['support-t1','桌面三脚架','T1','support','让桌面记录稳定下来',['桌面高度','标准螺口','折叠结构'],['新手友好'],['experiment','live'],'support',false],
 ['support-t2','轻便三脚架','T2','support','稳住镜头，也让出双手',['轻便折叠','可调高度','标准螺口'],['轻便'],['vlog','interview'],'support',true],
 ['support-t3','手持稳定器','T3','support','给移动拍摄更顺的节奏',['三轴增稳','BL-C相机适配','手持控制'],['Vlog推荐'],['vlog'],'support',false],
 ['recorder-r2','双通道录音设备','R2','recorder','让多路声音各有自己的轨道',['双通道','外接麦克风','监听接口'],['采访常用'],['interview','experiment'],'audio',false],
 ['capture-s1','视频采集卡','S1','capture','把镜头画面带入直播工作台',['HDMI输入','USB输出','1080p采集'],['直播常用'],['live'],'capture',true],
 ['capture-s2','直播摄像设备','S2','capture','轻松开始一次清晰的分享',['USB连接','自动对焦','桌面安装'],['直播常用','新手友好'],['live'],'capture',false],
 ['capture-s3','多路导播接口','S3','capture','让多个视角有序地进入画面',['多路输入','切换控制','USB输出'],['多机位'],['live','presentation'],'capture',false]
];
export const equipment=rows.map(([id,name,model,category,description,specs,tags,scenes,capability,recommended],index)=>({id,name,model:`BL ${model}`,category,description,specs,tags,scenes,capability,recommended,isNew:index>=25,operationalStatus:['drone-a2','light-f3'].includes(id)?'maintenance':'active',cover:{type:'original-svg',family:category},color:['mist','silver','lavender'][index%3],demo:true,productName:`Borrow ${({camera:"Camera",lens:"Lens",drone:"Air",gimbal:"Pocket",microphone:"Mic",light:"Light",projector:"Beam",support:"Stand",recorder:"Sound",capture:"Link"})[category]} ${["One","Pro","Air"][index%3]}`}));
export const legacyEquipment=equipment.filter(item=>['camera','projector','recorder'].includes(item.id));
export const scenes=[['vlog','轻便 Vlog','小体积，也有完整表达'],['interview','校园采访','把人物与声音记录清楚'],['presentation','作品演示','让准备好的内容被看见'],['live','直播分享','画面与声音，顺畅连接'],['aerial','户外航拍','换一个视角观察世界'],['experiment','实验记录','把每一步，留成证据']].map(([id,name,description])=>({id,name,description}));
export const heroSlides=[
 {equipmentId:'camera',visual:'cinema',label:'影视创作',title:'灵感，\n即刻就位。',description:'好设备，为下一次创作就位。'},
 {equipmentId:'gimbal-g1',visual:'vlog',label:'轻便 Vlog',title:'轻装，\n也能出彩。',description:'把轻便与稳定装进口袋，记录每一个值得分享的瞬间。'},
 {equipmentId:'drone-a1',visual:'outdoor',label:'户外视角',title:'视野，\n再打开一点。',description:'从地面走向全景，为观察与创作打开另一种视角。'},
 {equipmentId:'microphone-m1',visual:'voice',label:'清晰表达',title:'好故事，\n值得听清。',description:'给采访、分享和创作，一份清晰而从容的声音。'},
 {equipmentId:'projector',visual:'presentation',label:'灵感演示',title:'让想法，\n亮起来。',description:'把准备好的作品，带到更大的画面。'}
];
