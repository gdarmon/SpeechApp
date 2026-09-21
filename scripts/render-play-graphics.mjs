import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
const logo=await readFile('assets/branding/fala-logo.png');
const icon=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#12664f"/><image href="data:image/png;base64,${logo.toString('base64')}" x="0" y="0" width="512" height="512"/></svg>`;
const browser=await chromium.launch({executablePath:process.env.FALA_TEST_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 for(const [name,svg,width,height,mime] of [['icon-512.png',icon,512,512,'image/png'],['feature-graphic-1024x500.jpg',await readFile('store/google-play/feature-graphic.svg','utf8'),1024,500,'image/jpeg']]) {
  const url=await page.evaluate(async({svg,width,height,mime})=>{
   const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL(mime,.96);
  },{svg,width,height,mime});
  await writeFile('store/google-play/'+name,Buffer.from(url.split(',')[1],'base64'));
 }
}finally{await browser.close();}
