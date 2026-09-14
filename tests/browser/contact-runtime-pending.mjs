async page => {
  await page.getByLabel('Name').fill('Pending visitor')
  await page.getByLabel('Email Address').fill('pending@example.com')
  await page.getByRole('button', { name: 'Send Message' }).click()
}
