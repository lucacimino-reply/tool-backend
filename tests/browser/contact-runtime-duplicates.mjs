async page => {
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const name = 'Duplicate browser visitor'
const email = 'duplicate-browser@example.com'
for (let attempt = 0; attempt < 2; attempt += 1) {
  await page.getByRole('heading', { name: 'Contact Us' }).waitFor()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email Address').fill(email)
  await page.getByRole('button', { name: 'Send Message' }).click()
  await page.getByRole('heading', { name: 'Thank you!' }).waitFor()
  if (attempt === 0) await page.getByRole('button', { name: 'Back to Home' }).click()
}
assert(await page.getByText('STUDIO').isVisible(), 'shared confirmation header is absent')
for (const label of ['Work', 'About', 'Contact']) {
  const url = page.url()
  await page.getByText(label, { exact: true }).click()
  assert(page.url() === url, `${label} changed the confirmation page`)
}
}
