import {createProductStore} from '../src/product-store.js';
import {resolve} from 'node:path';
const store=createProductStore(resolve('data/borrow-lab.sqlite'),{legacyFile:resolve('data/reservations.json')});
try {store.seed();console.log('设备28件；账号'+store.users().length+'个；有效预约'+store.list().length+'条。重复初始化不会覆盖个人数据。');}finally{store.close();}
