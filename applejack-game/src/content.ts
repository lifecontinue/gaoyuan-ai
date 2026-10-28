export const mailTasks = [
 {note:'亲爱的朋友：请把邀请函送到谷仓。我们要在那里布置丰收节的舞台。',question:'邀请函应该送到哪里？',options:['谷仓','邮局','花园'],answer:0,explain:'便条中写着“请把邀请函送到谷仓”。找到地点，就能送对信。'},
 {note:'今天的准备顺序是：先采苹果，再做苹果派，最后布置餐桌。',question:'采完苹果，接下来做什么？',options:['布置餐桌','做苹果派','去睡觉'],answer:1,explain:'“先、再、最后”告诉我们事情的顺序。采完苹果，再做苹果派。'},
 {note:'萍琪要在广场准备音乐，柔柔会在花园照料小动物。请把乐谱送给萍琪。',question:'应该去哪里送乐谱？',options:['厨房','花园','广场'],answer:2,explain:'萍琪在广场准备音乐，所以乐谱要送到广场。'},
 {note:'苹果嘉儿说：“先把苹果洗干净，然后切成小块。切好之后才能装盘。”',question:'哪一步必须最先完成？',options:['洗苹果','装盘','切苹果'],answer:0,explain:'便条中的“先”说明，洗干净是第一步。'},
 {note:'彩虹旗放在红色箱子里，餐巾放在蓝色箱子里。请帮我取出餐巾。',question:'应该打开哪个箱子？',options:['红色箱子','蓝色箱子','两个都不用'],answer:1,explain:'找出物品与地点的对应关系：餐巾在蓝色箱子里。'},
 {note:'丰收节下午开始。朋友们会在开始前来到谷仓，一起把桌椅搬到广场。',question:'朋友们先在哪里集合？',options:['广场','果园','谷仓'],answer:2,explain:'朋友们先来到谷仓集合，再把桌椅搬到广场。'}
];
export const gardenTasks = [
 {factor:'水分',a:'适量浇水',b:'不浇水',answer:0,question:'几天后，哪盆更可能长得健康？',explain:'同种植物在其他条件相同时，获得适量水分的一盆更可能健康生长。'},
 {factor:'光照',a:'放在有适宜光照处',b:'一直放在黑暗处',answer:0,question:'哪种照料方式更适合长期生长？',explain:'植物长期生长需要适宜的光照。观察时要保持水分、土壤等其他条件相同。'},
 {factor:'水分',a:'不浇水',b:'适量浇水',answer:1,explain:'A盆没有浇水，更需要补水。对比实验中B盆获得适量水分，更可能健康。',question:'哪盆更可能保持健康？'},
 {factor:'光照',a:'一直放在黑暗处',b:'放在有适宜光照处',answer:1,question:'哪盆更可能长期健康生长？',explain:'B盆有适宜光照，其他条件相同时，更有利于长期生长。'},
 {factor:'水分',a:'每天大量浇水，土壤积水',b:'根据土壤情况适量浇水',answer:1,question:'哪种浇水方法更合适？',explain:'浇水不是越多越好。长期积水会影响根部，适量浇水更合适。'},
 {factor:'实验条件',a:'只改变水分',b:'同时改变水分、光照和土壤',answer:0,question:'想研究水分的影响，哪组比较更公平？',explain:'一次只改变一个条件，才能更清楚地观察这个条件带来的影响。'}
];
export const decorations=[{id:'flowers',name:'庆典花圃',cost:3,description:'让果园开满小花'}, {id:'bunting',name:'彩色旗帜',cost:6,description:'挂起丰收节的彩旗'}, {id:'table',name:'分享餐桌',cost:9,description:'邀请朋友一起分享'}];
