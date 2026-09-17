const {execSync}=require('child_process');
const fs=require('fs');
const opt={cwd:'d:/CodeSpace/MinGuoFengYun/vicissitudes',encoding:'utf8',shell:'bash.exe'};
let o='';
try{
  execSync('rm -f _gs.txt _x.cjs _d.cjs',opt);
  execSync('git add -A',opt);
  const msg='R1+R2+R3 三环验收：时间账本/处境/政治环全绿（unit 324/324；gate / graph 252 边 / mut 5/5 全过；acceptance-r1~r3 在录）';
  execSync('git commit -m "'+msg+'"',opt);
  o+=execSync('git log --oneline -3',opt);
  o+='>>> status after\n'+execSync('git status --short',opt);
}catch(e){o+='FAIL: '+(e.message||'').slice(0,600)+'\n'+(e.stdout||'') + '\n' + (e.stderr||'')}
fs.writeFileSync(opt.cwd+'/_gc.txt',o,'utf8');