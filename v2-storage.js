(() => {
 'use strict';
 let opening;
 function open(){if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open('water-product-v2',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('请关闭旧版页面后重试'));});return opening;}
 window.WaterV2Storage={
  async read(project){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly'),request=tx.objectStore('projects').get(project);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});},
  async write(project,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(value,project);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('存储事务未完成'));});}
 };
})();
