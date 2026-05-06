import { test, expect } from "@playwright/test"

test.describe("登录页面", () => {
  test("应该显示登录表单", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("text=登录")).toBeVisible()
  })
})

test.describe("驾驶舱页面", () => {
  test("未登录应该重定向到登录页", async ({ page }) => {
    await page.goto("/executive")
    await expect(page).toHaveURL(/.*login/)
  })
})
