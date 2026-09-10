import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('real API accepts a public lead from the landing form', async ({ page }) => {
  const backend = fileURLToPath(new URL('../../backend', import.meta.url))
  const name = `QA Landing ${Date.now()}`
  const phone = execFileSync(process.execPath, ['--env-file=.env', '-e', `
    const {PrismaClient}=require('@prisma/client');const {randomInt}=require('node:crypto');const p=new PrismaClient();
    (async()=>{let phone;do{phone='+7999'+randomInt(0,10000000).toString().padStart(7,'0');}while(await p.client.findUnique({where:{phone}}));process.stdout.write(phone);})().finally(()=>p.$disconnect());
  `], { cwd: backend, encoding: 'utf8' }).trim()
  try {
    await page.goto('/')
    await page.locator('#firstName').fill(name)
    await page.locator('#phone').fill(phone)
    const response = page.waitForResponse(response => response.url().endsWith('/api/leads') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    const saved = await response
    expect(saved.status()).toBe(201)
    expect(saved.request().headers()).not.toHaveProperty('authorization')
    await expect(page.getByRole('heading', { name: 'Заявка принята!' })).toBeVisible()
    const exists = execFileSync(process.execPath, ['--env-file=.env', '-e', `
      const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
      p.client.findUnique({where:{phone:process.argv[1]}}).then(row=>process.stdout.write(String(row?.firstName===process.argv[2]&&row.isLead))).finally(()=>p.$disconnect());
    `, phone, name], { cwd: backend, encoding: 'utf8' })
    expect(exists).toBe('true')
  } finally {
    execFileSync(process.execPath, ['--env-file=.env', '-e', `
      const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
      (async()=>{const row=await p.client.findUnique({where:{phone:process.argv[1]}});if(row?.firstName===process.argv[2]){await p.vkNotification.deleteMany({where:{key:'lead:'+row.id+':general'}});await p.client.delete({where:{id:row.id}});}})().finally(()=>p.$disconnect());
    `, phone, name], { cwd: backend })
  }
})
