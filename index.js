import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

function argv(k){const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a?a.split('=')[1]:''}
function env(k){return process.env[k]||process.env[k.toUpperCase()]||process.env[k.toLowerCase()]||''}
function out(s){process.stdout.write(s+"\n")}

async function main(){
  const uuid = env('uuid') || argv('uuid') || randomUUID()
  const argoDomainEnv = env('argodomain') || argv('argodomain') || ''
  const argoAuth = env('argoauth') || argv('argoauth') || ''
  const wsPath = '/cdn-cgi'
  const listenHost = '127.0.0.1'
  const listenPort = 8000
  const domains = ['www.visa.cn','adventure-x.org','www.hltv.org','www.faceit.com','icook.tw']

  let sniHost = ''
  let nodesPrinted = false
  let sbStreaming = false
  const sbBuf = []

  function printNodes(domainForSni){
    out('================ 节点信息 ================')
    const hostVal = domainForSni||''
    domains.forEach(d=>{
      const url = `vless://${uuid}@${d}:443?encryption=none&security=tls&type=ws&path=${wsPath}&host=${hostVal}&sni=${hostVal}`
      out(url)
    })
    if(domainForSni) out('临时隧道域名：'+domainForSni)
    out('========================================')
    nodesPrinted = true
    out('================ SingBox 日志 ================')
  }

  function startSingBox(){
    const cfg = {
      log:{level:'info',timestamp:false,disabled:false},
      inbounds:[{
        type:'vless',tag:'vless-in',listen:listenHost,listen_port:listenPort,
        users:[{uuid}],
        transport:{type:'ws',path:wsPath},
        tls:{enabled:false}
      }],
      outbounds:[{type:'direct'}]
    }
    const cfgPath = '/tmp/singbox.json'
    fs.writeFileSync(cfgPath, JSON.stringify(cfg))
    out('sing-box 启动')
    const sb = spawn('sing-box',['run','-c',cfgPath],{stdio:['ignore','pipe','pipe']})
    const onSB = (d)=>{
      const line = d.toString().trim()
      if(sbStreaming){ out(line) } else { if(line) sbBuf.push(line) }
    }
    sb.stdout.on('data',onSB)
    sb.stderr.on('data',onSB)
    sb.on('exit',code=>out('错误：singbox退出，代码 '+String(code)))
  }

  function startTemp(){
    const args=['tunnel','--edge-ip-version','auto','--no-autoupdate','--protocol','http2','--url',`http://${listenHost}:${listenPort}`]
    if(argoDomainEnv){args.push('--hostname',argoDomainEnv)}
    const p=spawn('cloudflared',args,{stdio:['ignore','pipe','pipe']})
    let capturedDomain = ''
    const handle = (txt)=>{
      const s = txt.toString()
      const m = s.match(/https?:\/\/([^ ]*trycloudflare\.com)/)
      if(m){capturedDomain = m[1]}
      if(/Registered tunnel connection/.test(s)){ out('临时隧道已连接') }
      if(capturedDomain && !nodesPrinted){ sniHost = capturedDomain; printNodes(sniHost); startSingBox(); sbStreaming = true }
    }
    p.stdout.on('data',handle)
    p.stderr.on('data',handle)
    out('隧道域名将是: '+(argoDomainEnv||'待生成'))
    out('正在启动临时 Cloudflared 隧道')
    out('等待 Cloudflared 临时隧道连接')
    p.on('exit',code=>{ if(!nodesPrinted && capturedDomain){ sniHost = capturedDomain; printNodes(sniHost); startSingBox(); sbStreaming = true } out('警告：临时隧道退出，代码 '+String(code)) })
  }

  function startToken(){
    const tokenRegex=/^[A-Za-z0-9._=-]{60,1024}$/
    if(!tokenRegex.test(argoAuth)){ out('警告：提供的认证信息无效，切换临时隧道'); startTemp(); return }
    sniHost = argoDomainEnv || ''
    out('隧道域名将是: '+sniHost)
    out('正在启动固定 Cloudflared 隧道')
    out('等待 Cloudflared 固定隧道连接')
    const p=spawn('cloudflared',['tunnel','run','--token',argoAuth],{stdio:['ignore','pipe','pipe'],env:{...process.env,TUNNEL_TOKEN:argoAuth}})
    const onCF=(d)=>{ const s=d.toString(); if(/Registered tunnel connection/.test(s)){ out('固定隧道已连接'); if(!nodesPrinted){ printNodes(sniHost); startSingBox(); sbStreaming = true } } }
    p.stdout.on('data',onCF); p.stderr.on('data',onCF)
    p.on('exit',code=>{ if(!nodesPrinted){ printNodes(sniHost); startSingBox(); sbStreaming = true } out('警告：令牌隧道退出，代码 '+String(code)) })
  }

  out('UUID: '+uuid)
  if(argoAuth){ startToken() } else { startTemp() }
}

main().catch(e=>{ out('错误：'+String(e&&e.message?e.message:e)) })
