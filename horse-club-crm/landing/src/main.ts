import './style.css'
import { club, type Direction, type Profile } from './content'
import { phoneDigits, phoneMask, sendLead, type LeadPayload } from './lead'

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const safeUrl = (value: string): string => {
  try { const url = new URL(value); return url.protocol === 'https:' ? escape(url.href) : '' } catch { return '' }
}
const arrow = '<span aria-hidden="true">↗</span>'
const logo = '<span class="brand-mark" aria-hidden="true">♞</span>'
const profiles = (rows: Profile[]) => rows.map(row => `<article class="profile">${row.image && safeUrl(row.image) ? `<img src="${safeUrl(row.image)}" alt="${escape(row.name)}" loading="lazy" width="500" height="560">` : '<div class="profile-symbol" aria-hidden="true">♞</div>'}<p class="eyebrow">${escape(row.specialty)}</p><h3>${escape(row.name)}</h3><p>${escape(row.description)}</p></article>`).join('')

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip-link" href="#main">Перейти к содержимому</a>
  <header class="site-header wrap flex items-center justify-between gap-4">
    <a href="#" class="brand" aria-label="${escape(club.name)} — главная">${logo}<span>${escape(club.name)}<small>ВЕРХОВАЯ ЕЗДА · НОВЫЙ ОПЫТ</small></span></a>
    <button class="menu-toggle" aria-expanded="false" aria-controls="navigation" aria-label="Открыть меню">☰</button>
    <nav id="navigation" aria-label="Основная навигация"><a href="#directions">Направления</a><a href="#team">О клубе</a><a href="#contacts">Контакты</a><a class="button button-small" href="#booking">Записаться ${arrow}</a></nav>
  </header>
  <main id="main">
    <section class="hero wrap">
      <div class="hero-copy">
        <p class="eyebrow"><span class="small-line"></span> БЛИЖЕ К ПРИРОДЕ. БЛИЖЕ К СЕБЕ.</p>
        <h1>Счастье —<br>быть <em>в седле.</em></h1>
        <p class="hero-description">Оставьте городскую суету за оградой.<br>Откройте для себя мир лошадей —<br>в своём темпе, с первого шага.</p>
        <a class="button" href="#booking">Записаться на занятие ${arrow}</a>
        <div class="hero-note"><span class="round-icon" aria-hidden="true">✳</span><p>Первый раз в седле?<br><strong>Начнём со знакомства.</strong></p></div>
      </div>
      <div class="hero-visual"><img src="/images/horse.jpg" alt="Белая лошадь" width="1800" height="1200" fetchpriority="high"><div class="image-shade"></div><div class="image-caption"><span>МЕНЬШЕ СПЕШКИ</span><p>Больше настоящего.</p></div><a class="image-circle" href="#directions" aria-label="Посмотреть направления">↓</a></div>
    </section>
    <div class="values-strip"><div class="wrap flex flex-wrap justify-between gap-5"><span>Верховая езда</span><i>✧</i><span>Общение с лошадьми</span><i>✧</i><span>Время для себя</span><i>✧</i><span>Новые впечатления</span></div></div>
    <section id="directions" class="section wrap">
      <div class="section-heading"><div><p class="eyebrow">01 / НАЙДИТЕ СВОЁ</p><h2>У каждого —<br><em>свой путь к лошадям.</em></h2></div><p>Попробовать впервые, вернуться к любимому<br class="desktop-only"> занятию или найти новый формат отдыха.<br class="desktop-only"> Начните с того, что вам ближе.</p></div>
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">${club.directions.map((item, index) => `<article class="service-card"><div class="card-top"><span>0${index + 1}</span><span aria-hidden="true">${['♞', '◷', '⌂', '✧'][index]}</span></div><p class="eyebrow">${escape(item.format)}</p><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><div class="card-bottom"><small>${escape(item.duration)}</small><strong>${escape(item.price)}</strong><a href="#booking" data-direction="${item.key}" aria-label="Выбрать: ${escape(item.title)}">Обсудить детали ${arrow}</a></div></article>`).join('')}</div>
      <p class="section-note">Стоимость, продолжительность и доступность выбранного формата уточнит администратор.</p>
    </section>
    <section id="team" class="team-section"><div class="wrap grid gap-12 lg:grid-cols-2 items-center">
      <div class="team-photo"><img src="/images/horse.jpg" alt="Знакомство с миром лошадей" width="900" height="1000" loading="lazy"><span class="photo-label">С УВАЖЕНИЕМ К ЛОШАДИ</span></div>
      <div><p class="eyebrow">02 / НЕ ПРОСТО СПОРТ</p><h2>Контакт,<br>который <em>чувствуешь.</em></h2><p class="large-copy">Верховая езда начинается не с скорости. Она начинается с доверия.</p><p class="muted">Расскажите о своём опыте и целях. Администратор познакомит вас с командой, уточнит доступных лошадей и поможет выбрать занятие.</p><div class="approach"><span>01</span><div><h3>Ваш тренер</h3><p>Обсудите подготовку, направление и задачи первого занятия.</p></div></div><div class="approach"><span>02</span><div><h3>Ваш партнёр</h3><p>Выбор лошади с учётом опыта всадника и формата тренировки.</p></div></div><a class="text-link" href="#booking">Расскажите, о чём мечтаете ${arrow}</a></div>
    </div>${club.trainers.length || club.horses.length ? `<div class="wrap grid gap-6 sm:grid-cols-2 lg:grid-cols-4 profiles">${profiles(club.trainers)}${profiles(club.horses)}</div>` : ''}</section>
    <section id="booking" class="section wrap booking-section grid gap-12 lg:grid-cols-2">
      <div class="booking-copy"><p class="eyebrow">03 / ВАШ ПЕРВЫЙ ШАГ</p><h2>Встретимся<br><em>в седле?</em></h2><p class="large-copy">Оставьте заявку.<br>Остальное обсудим вместе.</p><p class="muted">Администратор свяжется с вами, ответит на вопросы и поможет выбрать время. Заявка не требует предварительной оплаты.</p><div class="steps"><p><span>1</span>Расскажите немного о себе</p><p><span>2</span>Обсудите детали с администратором</p><p><span>3</span>Приезжайте за новым опытом</p></div></div>
      <div class="form-card">
        <form id="lead-form" novalidate>
          <h3>Запись на знакомство</h3><p class="form-intro">Поля со звёздочкой обязательны</p>
          <div class="grid gap-x-5 sm:grid-cols-2"><div class="field"><label for="firstName">Ваше имя *</label><input id="firstName" name="firstName" autocomplete="given-name" maxlength="100" required placeholder="Как к вам обращаться"><small id="firstName-error" class="field-error"></small></div><div class="field"><label for="phone">Телефон *</label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="+7 (___) ___-__-__" aria-describedby="phone-help"><small id="phone-help">Российский номер, +7 или 8</small><small id="phone-error" class="field-error"></small></div></div>
          <div class="field"><label for="email">Email <span>необязательно</span></label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com"><small id="email-error" class="field-error"></small></div>
          <div class="field"><label for="direction">Что вам интересно?</label><select id="direction" name="direction"><option value="">Помогите определиться</option>${club.directions.map(item => `<option value="${item.key}">${escape(item.title)}</option>`).join('')}</select></div>
          <div class="field"><label for="preferences">Опыт и пожелания <span>необязательно</span></label><textarea id="preferences" name="preferences" rows="3" maxlength="1500" placeholder="Например: никогда не сидел(а) в седле, хочу попробовать"></textarea></div>
          <div class="honeypot" aria-hidden="true"><label for="website">Ваш сайт</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
          <p id="form-error" role="alert" class="form-error" hidden></p>
          <button id="submit-lead" class="button w-full" type="submit"><span>Отправить заявку</span>${arrow}</button>
          <p class="form-caption">Оставляя контакты, вы просите администратора связаться с вами по поводу занятия.</p>
        </form>
        <div id="success" tabindex="-1" role="status" hidden><div class="success-icon">✓</div><p class="eyebrow">ДО СКОРОЙ ВСТРЕЧИ</p><h3>Заявка принята!</h3><p>Администратор свяжется с вами, чтобы обсудить занятие.</p><button class="text-link" id="another-request" type="button">Отправить ещё одну заявку ${arrow}</button></div>
      </div>
    </section>
    <section id="contacts" class="contacts-section"><div class="wrap grid gap-12 lg:grid-cols-2"><div><p class="eyebrow">04 / СТАНЕМ БЛИЖЕ</p><h2>Вдали от суеты.<br><em>На связи с вами.</em></h2><div class="contact-details"><p><span>ЛОКАЦИЯ</span>${club.address ? escape(club.address) : 'Администратор пришлёт адрес и маршрут перед визитом.'}</p><p><span>ЧАСЫ РАБОТЫ</span>${club.hours ? escape(club.hours) : 'Посещение по предварительной записи. Уточните удобное время в заявке.'}</p>${club.phone ? `<p><span>ТЕЛЕФОН</span><a href="tel:${escape(club.phone.replace(/[^+\d]/g, ''))}">${escape(club.phone)}</a></p>` : ''}</div><div class="flex flex-wrap gap-4">${safeUrl(club.vkUrl) ? `<a class="button button-light" href="${safeUrl(club.vkUrl)}" target="_blank" rel="noopener noreferrer">Написать ВКонтакте ${arrow}</a>` : '<a class="button button-light" href="#booking">Связаться с клубом ↗</a>'}${safeUrl(club.mapUrl) ? `<a class="text-link" href="${safeUrl(club.mapUrl)}" target="_blank" rel="noopener noreferrer">Построить маршрут ${arrow}</a>` : ''}</div></div><div class="location-card"><span class="location-icon" aria-hidden="true">⌖</span><p class="eyebrow">СПЛАНИРУЕМ ВСТРЕЧУ</p><h3>Путь к вашему<br>новому увлечению.</h3><p>${club.address ? escape(club.address) : 'Оставьте заявку — уточним время и подскажем, как добраться.'}</p><a href="${safeUrl(club.mapUrl) || '#booking'}" class="text-link">${club.mapUrl ? 'Открыть карту' : 'Уточнить маршрут'} ${arrow}</a></div></div></section>
  </main>
  <footer class="wrap footer"><a class="brand" href="#">${logo}<span>${escape(club.name)}</span></a><p>Для тех, кто любит лошадей. И тех, кто только влюбится.</p><a href="#">Наверх ↑</a></footer>
`

const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!
const nav = document.querySelector<HTMLElement>('#navigation')!
function closeMenu() { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Открыть меню') }
toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню') })
nav.addEventListener('click', event => { if ((event.target as HTMLElement).closest('a')) closeMenu() })
document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); toggle.focus() } })
const form = document.querySelector<HTMLFormElement>('#lead-form')!
const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement
const directionSelect = document.querySelector<HTMLSelectElement>('#direction')!
document.querySelectorAll<HTMLAnchorElement>('[data-direction]').forEach(link => link.addEventListener('click', () => { directionSelect.value = link.dataset.direction || '' }))
const phone = input('phone')
phone.addEventListener('keydown', event => {
  const caret = phone.selectionStart ?? 0
  if (event.key === 'Backspace' && caret === phone.selectionEnd && caret > 0 && /\D/.test(phone.value[caret - 1]!)) {
    let start = caret - 1
    while (start > 0 && /\D/.test(phone.value[start]!)) start--
    event.preventDefault()
    phone.setRangeText('', start, caret, 'end')
    phone.dispatchEvent(new Event('input', { bubbles: true }))
  }
})
phone.addEventListener('input', () => {
  const caret = phone.selectionStart ?? phone.value.length
  const count = phone.value.slice(0, caret).replace(/\D/g, '').length
  const previous = phone.value
  phone.value = phoneMask(previous)
  if (caret < previous.length) {
    let seen = 0, position = 0
    while (position < phone.value.length && seen < count) { if (/\d/.test(phone.value[position]!)) seen++; position++ }
    phone.setSelectionRange(position, position)
  }
})
const submit = document.querySelector<HTMLButtonElement>('#submit-lead')!
const success = document.querySelector<HTMLElement>('#success')!
const errorBox = document.querySelector<HTMLElement>('#form-error')!
let pending = false
function fieldError(name: string, message: string) {
  const field = input(name)
  document.getElementById(`${name}-error`)!.textContent = message
  field.setAttribute('aria-invalid', String(Boolean(message)))
  field.setAttribute('aria-describedby', `${name === 'phone' ? 'phone-help ' : ''}${name}-error`)
}
form.addEventListener('submit', async event => {
  event.preventDefault()
  if (pending) return
  errorBox.hidden = true
  const firstName = input('firstName').value.trim()
  const digits = phoneDigits(phone.value)
  const email = input('email').value.trim()
  fieldError('firstName', firstName ? '' : 'Пожалуйста, укажите имя')
  fieldError('phone', /^7\d{10}$/.test(digits) ? '' : 'Введите номер полностью: 11 цифр')
  fieldError('email', !email || input('email').validity.valid ? '' : 'Проверьте адрес электронной почты')
  const invalid = form.querySelector<HTMLInputElement>('[aria-invalid="true"]')
  if (invalid) { invalid.focus(); return }
  if (input('website').value) { form.hidden = true; success.hidden = false; success.focus(); return }
  const direction = (club.directions as Direction[]).find(item => item.key === directionSelect.value)
  const wishes = (form.elements.namedItem('preferences') as HTMLTextAreaElement).value.trim()
  const preferences = [direction ? `Направление: ${direction.title}` : '', wishes].filter(Boolean).join('\n')
  const payload: LeadPayload = { firstName, phone: `+${digits}`, ...(email ? { email } : {}), ...(preferences ? { preferences } : {}) }
  if (direction?.serviceId && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(direction.serviceId)) payload.serviceId = direction.serviceId
  pending = true; submit.disabled = true; form.setAttribute('aria-busy', 'true'); submit.querySelector('span')!.textContent = 'Отправляем…'
  try { await sendLead(payload); form.hidden = true; success.hidden = false; success.focus() }
  catch (error) { errorBox.textContent = error instanceof Error ? error.message : 'Не удалось отправить заявку'; errorBox.hidden = false }
  finally { pending = false; submit.disabled = false; form.removeAttribute('aria-busy'); submit.querySelector('span')!.textContent = 'Отправить заявку' }
})
document.querySelector('#another-request')!.addEventListener('click', () => { form.reset(); success.hidden = true; form.hidden = false; input('firstName').focus() })
