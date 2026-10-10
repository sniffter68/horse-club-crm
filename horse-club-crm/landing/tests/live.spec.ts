import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('real API accepts a public lead from the landing form', async ({ page }) => {
  test.skip(process.env.RUN_LANDING_LIVE !== 'true', 'Requires an explicitly configured local backend and database');
  const backend = fileURLToPath(new URL('../../backend', import.meta.url))
  const name = `QA Landing ${Date.now()}`
  const phone = execFileSync(process.execPath, ['--env-file=.env', '-e', `
    const {PrismaClient}=require('@prisma/client');const {randomInt}=require('node:crypto');const p=new PrismaClient();
    (async()=>{let phone;do{phone='+7999'+randomInt(0,10000000).toString().padStart(7,'0');}while(await p.leadRequest.findFirst({where:{phone}}));process.stdout.write(phone);})().finally(()=>p.$disconnect());
  `], { cwd: backend, encoding: 'utf8' }).trim()
  try {
    await page.goto('/')
    await page.locator('#contact-name').fill(name)
    await page.locator('#contact-phone').fill(phone)
    await page.getByLabel('Я даю согласие на обработку персональных данных для рассмотрения заявки.').check()
    const response = page.waitForResponse(response => response.url().endsWith('/api/leads') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click()
    const saved = await response
    expect(saved.status()).toBe(201)
    expect(saved.request().headers()).not.toHaveProperty('authorization')
    await expect(page.getByRole('status')).toContainText('Заявка принята')
    const exists = execFileSync(process.execPath, ['--env-file=.env', '-e', `
      const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
      p.leadRequest.findFirst({where:{phone:process.argv[1],firstName:process.argv[2]}}).then(row=>process.stdout.write(String(row?.status==='PENDING'&&row.consentSource==='LANDING'))).finally(()=>p.$disconnect());
    `, phone, name], { cwd: backend, encoding: 'utf8' })
    expect(exists).toBe('true')
  } finally {
    execFileSync(process.execPath, ['--env-file=.env', '-e', `
      const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
      (async()=>{const row=await p.leadRequest.findFirst({where:{phone:process.argv[1],firstName:process.argv[2],status:'PENDING'}});if(row){await p.vkNotification.deleteMany({where:{key:{startsWith:'lead:'+row.id+':'}}});await p.leadRequest.delete({where:{id:row.id}});}})().finally(()=>p.$disconnect());
    `, phone, name], { cwd: backend })
  }
})
