const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
mock.method(require('../dist/bookings/booking-rules.service').BookingRulesService.prototype, 'validate', async () => {});
const { Test } = require('@nestjs/testing');
const { Reflector } = require('@nestjs/core');
const { firstValueFrom, of } = require('rxjs');
const request = require('supertest');
const { SanitizeRbacInterceptor } = require('../dist/common/interceptors/sanitize-rbac.interceptor');
const { requestLimits } = require('../dist/common/request-limits');
const { LessonsController } = require('../dist/lessons/lessons.controller');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { AuthController } = require('../dist/auth/auth.controller');
const { AuthService } = require('../dist/auth/auth.service');
const { LeadsService } = require('../dist/leads/leads.service');
const { sessionCookieName } = require('../dist/auth/session-cookie');
const { CommonModule } = require('../dist/common/common.module');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { AuthModule } = require('../dist/auth/auth.module');
const { PrismaModule } = require('../dist/prisma/prisma.module');
const { PrismaService } = require('../dist/prisma/prisma.service');

test('trainer cannot change lesson status through HTTP, manager can', async () => {
  let changes = 0;
  const module = await Test.createTestingModule({ imports: [CommonModule], controllers: [LessonsController], providers: [
    { provide: LessonsService, useValue: { updateLessonStatus: async () => { changes++; return {}; },
      findOne: async () => ({bookings:[{client:{name:'Test',medicalNotes:'secret'},payments:[{amount:10}]}]}) } }, RolesGuard,
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) {
    const req = ctx.switchToHttp().getRequest(); req.user = { role: req.headers['x-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication(); await app.init();
  try {
    const path = '/lessons/11111111-1111-4111-8111-111111111111/status';
    await request(app.getHttpServer()).patch(path).set('x-role','TRAINER').send({status:'CANCELLED'}).expect(403);
    assert.equal(changes,0);
    await request(app.getHttpServer()).patch(path).set('x-role','MANAGER').send({status:'CANCELLED'}).expect(200);
    assert.equal(changes,1);
    const details = await request(app.getHttpServer()).get('/lessons/11111111-1111-4111-8111-111111111111').set('x-role','TRAINER').expect(200);
    assert.deepEqual(details.body,{bookings:[{client:{name:'Test'},payments:[]}]});
  } finally { await app.close(); }
});

test('logout revokes copied tokens and deleted users cannot authenticate',async()=>{
  let row={id:'u',email:'a@example.com',role:'ADMIN',tokenVersion:1,updatedAt:new Date('2020-01-01')};
  const prisma={user:{findUnique:async()=>row,update:async({data})=>Object.assign(row, { tokenVersion: row.tokenVersion + data.tokenVersion.increment })}};
  const strategy=new JwtStrategy({secret:'test-secret-that-is-at-least-32-bytes'},prisma);
  const claims={sub:row.id,email:row.email,role:row.role,exp:9999999999,authVersion:String(row.tokenVersion)};
  await strategy.validate(claims);
  await new AuthService(prisma,{}).logout(row);
  await assert.rejects(strategy.validate(claims),e=>e.getStatus()===401);
  row=null;await assert.rejects(strategy.validate(claims),e=>e.getStatus()===401);
});

test('trainer redaction covers nested arrays while preserving admin data and dates', async () => {
  const interceptor = new SanitizeRbacInterceptor(new Reflector());
  const value = { at: new Date(), bookings: [{ client: { name:'Test',medicalNotes:'private',phone:'private' }, payments:[{amount:10}], membership:{id:'private'} }], trainer:{baseRate:100} };
  const ctx = role => ({ getHandler:()=>function(){},getClass:()=>class{},switchToHttp:()=>({getRequest:()=>({user:{role}})}) });
  const result = await firstValueFrom(interceptor.intercept(ctx('TRAINER'),{handle:()=>of(value)}));
  assert.deepEqual(result,{at:value.at,bookings:[{client:{name:'Test'},payments:[]}],trainer:{}});
  assert.equal(await firstValueFrom(interceptor.intercept(ctx('ADMIN'),{handle:()=>of(value)})),value);
});

test('limiter blocks login floods and rejects cross-origin cookie writes', () => {
  const run=requestLimits();
  const req={path:'/api/auth/login',method:'POST',ip:'127.0.0.1',socket:{},headers:{},protocol:'https',get:()=> 'crm.test'};
  let status, passes=0; const res={setHeader(){},status(code){status=code;return this;},json(){}};
  for(let i=0;i<11;i++) run(req,res,()=>passes++);
  assert.equal(passes,10);assert.equal(status,429);
  status=undefined;
  run({...req,headers:{cookie:`${sessionCookieName()}=secret`,origin:'https://evil.test'}},res,()=>assert.fail('CSRF accepted'));
  assert.equal(status,403);
  run({...req,headers:{cookie:`${sessionCookieName()}=secret`}},res,()=>assert.fail('missing origin accepted'));
  assert.equal(status,403);
});

test('browser login sets HttpOnly cookie and never exposes the JWT in JSON', async () => {
  const module=await Test.createTestingModule({controllers:[AuthController],providers:[
    {provide:AuthService,useValue:{login:async()=>({access_token:'private-jwt',user:{id:'a',email:'a@example.com',role:'ADMIN'}})}}
  ]}).overrideGuard(JwtAuthGuard).useValue({canActivate:()=>true}).compile();
  const app=module.createNestApplication();await app.init();
  try {
    const response=await request(app.getHttpServer()).post('/auth/login').send({}).expect(200);
    assert.equal(response.body.access_token,'cookie-session');
    assert.match(response.headers['set-cookie'][0],/HttpOnly/);
    assert.match(response.headers['set-cookie'][0],/SameSite=Strict/);
    assert.equal(response.headers['cache-control'],'no-store');
  }finally{await app.close();}
});

test('production public leads are disabled by default for both landing and VK',async()=>{
  const oldEnv=process.env.NODE_ENV,oldEnabled=process.env.PUBLIC_LEADS_ENABLED;
  try{process.env.NODE_ENV='production';delete process.env.PUBLIC_LEADS_ENABLED;
    for(const channel of ['LANDING','VK']) await assert.rejects(new LeadsService({}).create({},channel),error=>error.getStatus()===503);
  }finally{if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
    if(oldEnabled===undefined)delete process.env.PUBLIC_LEADS_ENABLED;else process.env.PUBLIC_LEADS_ENABLED=oldEnabled;}
});

test('foreign or forbidden membership is rejected before booking mutation',async()=>{
  const tx={service:{findUnique:async()=>({maxCapacity:2,durationMinutes:30,allowMembership:true})},
    membership:{findUnique:async()=>({clientId:'other',remainedLessons:5,validUntil:new Date('2099-01-01')})}};
  const service=new LessonsService({$transaction:async fn=>fn(tx)},{});
  const dto={trainerId:'t',serviceId:'s',startTime:'2026-10-01T10:00:00Z',participants:[{clientId:'client',membershipId:'m'}]};
  await assert.rejects(service.createLesson(dto),error=>error.getStatus()===400);
  tx.service.findUnique=async()=>({maxCapacity:2,durationMinutes:30,allowMembership:false});
  await assert.rejects(service.createLesson(dto),error=>error.getStatus()===400);
});

test('real HTTP cookie authentication, CSRF rejection and logout revocation',async()=>{
  const oldSecret=process.env.JWT_SECRET;
  process.env.JWT_SECRET='test-only-secret-with-more-than-32-bytes';
  const row={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',role:'ADMIN',tokenVersion:1,
    updatedAt:new Date('2020-01-01'),passwordHash:await require('bcrypt').hash('test-password',4)};
  const prisma={user:{findUnique:async()=>row,update:async({data})=>Object.assign(row, { tokenVersion: row.tokenVersion + data.tokenVersion.increment })}};
  let app;
  try {
    const module=await Test.createTestingModule({imports:[PrismaModule,AuthModule]})
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app=module.createNestApplication();app.setGlobalPrefix('api');app.use(requestLimits());await app.init();
    const agent=request.agent(app.getHttpServer());
    const login=await agent.post('/api/auth/login').set('Host','crm.test').set('Origin','http://crm.test')
      .send({email:row.email,password:'test-password'}).expect(200);
    const copiedToken=login.headers['set-cookie'][0].split(';')[0].split('=')[1];
    assert.equal(login.body.access_token,'cookie-session');
    await agent.get('/api/auth/me').set('Host','crm.test').expect(200);
    await agent.post('/api/auth/logout').set('Host','crm.test').set('Origin','http://evil.test').send({}).expect(403);
    await agent.post('/api/auth/logout').set('Host','crm.test').set('Origin','http://crm.test').send({}).expect(201);
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization',`Bearer ${copiedToken}`).expect(401);
  }finally{if(app)await app.close();if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
});
