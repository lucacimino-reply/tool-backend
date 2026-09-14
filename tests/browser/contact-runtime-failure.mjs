async page => {
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

await page.getByRole('heading', { name: 'Contact Us' }).waitFor()
await page.getByLabel('Name').fill('Unavailable backend')
await page.getByLabel('Email Address').fill('unavailable@example.com')
await page.getByRole('button', { name: 'Send Message' }).click()
await page.getByRole('alert').waitFor()
assert(await page.getByRole('alert').innerText() === 'Unable to submit your information. Please try again.', 'failure message differs')
assert(await page.getByRole('heading', { name: 'Contact Us' }).isVisible(), 'failure left the form')
assert(await page.getByLabel('Name').inputValue() === 'Unavailable backend', 'failure cleared name')
assert(await page.getByLabel('Email Address').inputValue() === 'unavailable@example.com', 'failure cleared email')
assert(!(await page.getByRole('heading', { name: 'Thank you!' }).count()), 'failure showed confirmation')
}
