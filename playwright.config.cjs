const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests',workers:1,timeout:90000,use:{baseURL:'http://127.0.0.1:4173',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},webServer:{command:'node tools/test-server.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
