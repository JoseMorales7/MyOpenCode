import { expect, test, type Locator } from "@playwright/test"
import type { SideChat } from "@opencode/schema/side-chat"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { sessionHref } from "../utils/app"
import { openSession } from "../utils/workspace"
import { expectSessionTitle } from "../utils/waits"

test.use({ viewport: { width: 1440, height: 900 } })

const passage = "This passage explains why ordered history matters."

const sourceMessages: SessionMessageInfo[] = [
  { id: "msg_original_question", type: "user", text: "Explain ordered history", time: { created: 1 } },
  {
    id: "msg_quoted_response",
    type: "assistant",
    agent: "build",
    model: { id: "test-model", providerID: "test" },
    content: [{ type: "text", text: passage }],
    time: { created: 2, completed: 3 },
  },
]

async function selectPassage(target: Locator) {
  await expect(target).toBeVisible()
  await target.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  })
}

test("attaches a selected quote without replacing or submitting the main draft", async ({ page }) => {
  const prompts: unknown[] = []

  const { editor } = await openSession(page, {
    name: "QuoteMain",
    pageMessages: () => ({ items: sourceMessages }),
    onPrompt: (input) => prompts.push(input),
  })

  await editor.fill("Explain just this point")
  await selectPassage(page.getByText(passage, { exact: true }))
  await page
    .getByRole("toolbar", { name: "Ask about selected text" })
    .getByRole("button", { name: "Ask here", exact: true })
    .click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText("Explain just this point")
  expect(prompts).toEqual([])
  await page.locator('[data-slot="composer-attachments"]').getByText("Quoted response", { exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Quoted response" })
  await dialog.getByRole("textbox").fill("Focus on ordering, not storage")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await editor.press("Enter")
  await expect.poll(() => prompts.length).toBe(1)
  expect(JSON.stringify(prompts[0])).toContain(passage)
  expect(JSON.stringify(prompts[0])).toContain("Focus on ordering, not storage")
  expect(JSON.stringify(prompts[0])).toContain("Explain just this point")
})

for (const mode of ["conversation", "selection", "fresh"] as const) {
  test(`isolates ${mode} side dialogue, preserves drafts, restores it, and forgets it on close`, async ({
    page,
  }, testInfo) => {
    const calls: { prompt: string; sideChat?: SideChat.Input; sessionID?: string }[] = []
    const prompts: unknown[] = []

    const answer = (input: { prompt: string; sideChat?: SideChat.Input; sessionID?: string }) => {
      calls.push(input)

      return { text: calls.length === 1 ? "First focused answer" : "Follow-up answer" }
    }

    const { editor } = await openSession(page, {
      name: `Side${mode}`,
      pageMessages: () => ({ items: sourceMessages }),
      generate: answer,
      generateText: answer,
      onPrompt: (input) => prompts.push(input),
    })

    await editor.fill("Unsent main draft")
    await selectPassage(page.getByText(passage, { exact: true }))
    await page.getByRole("toolbar").getByRole("button", { name: "Ask in side chat" }).click()
    const panel = page.locator('[data-slot="session-btw-panel"]')
    const input = panel.getByRole("textbox", { name: "Side chat question", exact: true })
    await expect(input).toBeEditable()
    await expect(input).toBeFocused()
    expect(calls).toEqual([])
    await expect(editor).toHaveText("Unsent main draft")
    await panel.getByRole("combobox", { name: "Side chat context" }).selectOption(mode)
    await input.fill("Focused side question")
    await input.press("Enter")
    await expect(panel.getByRole("article", { name: "Side chat answer" })).toContainText("First focused answer")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sessionID !== undefined).toBe(mode === "conversation")
    expect(calls[0]?.sideChat?.quotes.length).toBe(mode === "fresh" ? 0 : 1)
    expect(calls[0]?.sideChat?.messages).toEqual([])

    if (mode === "conversation") expect(calls[0]).toMatchObject({ sideChat: { through: "msg_quoted_response" } })
    await expect(panel.getByRole("combobox", { name: "Side chat context" })).toBeDisabled()
    await input.fill("Explain the implication")
    await input.press("Enter")
    await expect(
      panel.getByRole("article", { name: "Side chat answer" }).filter({ hasText: "Follow-up answer" }),
    ).toBeVisible()
    expect(calls[1]?.sideChat?.messages).toEqual([
      { role: "user", text: "Focused side question" },
      { role: "assistant", text: "First focused answer" },
    ])
    expect(prompts).toEqual([])
    await expect(editor).toHaveText("Unsent main draft")
    await page.reload()
    await expect(panel.getByText("Follow-up answer", { exact: true })).toBeVisible()
    expect(calls).toHaveLength(2)
    await page.screenshot({ path: testInfo.outputPath(`side-${mode}.png`) })
    await page.getByRole("tab", { name: "Focused side question", exact: true }).click({ button: "middle" })
    await page
      .getByRole("dialog", { name: "Close side chat?" })
      .getByRole("button", { name: "Close and forget" })
      .click()
    await expect(page.getByRole("tab", { name: "Focused side question", exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("tab", { name: "Focused side question", exact: true })).toHaveCount(0)
    expect(prompts).toEqual([])
  })
}

test("stops only the side request and ignores its late response after retry", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 600, height: 850 })
  const held = Promise.withResolvers<{ text: string }>()
  const calls: string[] = []

  const { editor } = await openSession(page, {
    name: "SideCancellation",
    pageMessages: () => ({ items: sourceMessages }),
    generateText: (input) => {
      calls.push(input.prompt)

      return calls.length === 1 ? held.promise : { text: "Retried side answer" }
    },
  })

  await editor.fill("Keep main draft")
  await selectPassage(page.getByText(passage, { exact: true }))
  await page.getByRole("toolbar").getByRole("button", { name: "Ask in side chat" }).click()
  const panel = page.locator('[data-slot="session-btw-panel"]')
  await panel.getByRole("textbox", { name: "Side chat question", exact: true }).fill("Slow question")
  await panel.getByRole("button", { name: "Send", exact: true }).click()
  await expect(panel.getByRole("status")).toBeVisible()
  await panel.getByRole("button", { name: "Stop response" }).click()
  await panel.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(panel.getByText("Retried side answer", { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("side-mobile.png") })
  held.resolve({ text: "Stale answer" })
  await expect(panel.getByText("Stale answer", { exact: true })).toHaveCount(0)
  await page
    .getByRole("tablist", { name: "Session view", exact: true })
    .getByRole("tab", { name: "Session", exact: true })
    .click()
  await expect(editor).toHaveText("Keep main draft")
  expect(calls).toEqual(["Slow question", "Slow question"])
})

test("keeps separate one-shot /btw answers and restores them after reload", async ({ page }, testInfo) => {
  const prompts: unknown[] = []
  const generations: { sessionID: string; prompt: string }[] = []

  const { editor } = await openSession(page, {
    name: "BtwQuestions",
    onPrompt: (input) => prompts.push(input),
    generate: (input) => {
      generations.push(input)

      return {
        text: input.prompt.includes("second question")
          ? "Second answer"
          : `First answer\n\n${"A detailed explanation of the first question.\n\n".repeat(100)}End of first answer`,
      }
    },
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  await editor.fill("/btw first question")
  await editor.press("Enter")
  await expect(panel.getByText("First answer", { exact: true })).toBeVisible()
  await expect(panel.getByRole("textbox")).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toHaveCount(0)
  await panel.getByText("End of first answer", { exact: true }).scrollIntoViewIfNeeded()
  await expect(panel.getByText("End of first answer", { exact: true })).toBeInViewport()
  await editor.fill("/btw second question")
  await editor.press("Enter")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  const first = page.getByRole("tab", { name: "first question", exact: true })
  const second = page.getByRole("tab", { name: "second question", exact: true })
  await expect(first).toBeVisible()
  await expect(second).toHaveAttribute("data-selected", "")
  await page.screenshot({ path: testInfo.outputPath("separate-tabs.png") })
  expect(generations).toHaveLength(2)
  expect(generations[1]?.prompt).not.toContain("first question")
  expect(generations[1]?.prompt).not.toContain("First answer")

  await page.reload()
  await expect(first).toBeVisible()
  await expect(second).toHaveAttribute("data-selected", "")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  await first.click()
  await expect(panel.getByText("First answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("Second answer", { exact: true })).toHaveCount(0)
  await expect(panel.getByRole("textbox")).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath("restored-answer.png") })

  // Closing a tab forgets its question; the other tab and its answer survive a reload.
  await first.click({ button: "middle" })
  await expect(first).toHaveCount(0)
  await expect(second).toHaveAttribute("data-selected", "")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  await page.reload()
  await expect(second).toHaveAttribute("data-selected", "")
  await expect(panel.getByText("Second answer", { exact: true })).toBeVisible()
  await expect(first).toHaveCount(0)
  expect(generations).toHaveLength(2)
  expect(prompts).toEqual([])
})

test("isolates concurrent side questions and makes an interrupted reload retryable", async ({ page }) => {
  const held = Promise.withResolvers<void>()
  const attempts: string[] = []
  const prompts: unknown[] = []

  const { editor } = await openSession(page, {
    name: "BtwConcurrent",
    onPrompt: (input) => prompts.push(input),
    generate: async (input) => {
      attempts.push(input.prompt)

      if (input.prompt.includes("slow question") && attempts.length === 1) {
        await held.promise

        return { text: "Abandoned answer" }
      }

      return { text: input.prompt.includes("fast question") ? "Fast answer" : "Retried answer" }
    },
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  await editor.fill("/btw slow question")
  await editor.press("Enter")
  await expect(panel.getByRole("status")).toContainText("Working")
  await editor.fill("/btw fast question")
  await editor.press("Enter")
  await expect(panel.getByText("Fast answer", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "slow question", exact: true }).click()
  await expect(panel.getByRole("status")).toContainText("Working")
  await expect(panel.getByText("Fast answer", { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(panel.getByText("Couldn’t answer that question", { exact: true })).toBeVisible()
  await expect(panel.getByRole("status")).toHaveCount(0)
  expect(attempts).toHaveLength(2)
  await panel.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(panel.getByText("Retried answer", { exact: true })).toBeVisible()
  expect(attempts).toHaveLength(3)
  expect(attempts[2]).toContain("slow question")
  expect(attempts[2]).not.toContain("fast question")
  held.resolve()
  await page.getByRole("tab", { name: "fast question", exact: true }).click()
  await expect(panel.getByText("Fast answer", { exact: true })).toBeVisible()
  await page.getByRole("tab", { name: "slow question", exact: true }).click()
  await expect(panel.getByText("Retried answer", { exact: true })).toBeVisible()
  await expect(panel.getByText("Abandoned answer", { exact: true })).toHaveCount(0)
  await expect(panel.getByRole("textbox")).toHaveCount(0)
  expect(prompts).toEqual([])
})

test("keeps many long-titled side tabs usable at a narrow desktop width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 700 })

  const { editor } = await openSession(page, {
    name: "BtwOverflow",
    generate: () => ({ text: "Saved overflow answer" }),
  })

  const panel = page.locator('[data-slot="session-btw-panel"]')
  const questions = Array.from({ length: 12 }, (_, index) => `Side ${index + 1}: ${"long-title-".repeat(30)}`)

  for (const question of questions) {
    await editor.fill(`/btw ${question}`)
    await editor.press("Enter")
    await expect(page.getByRole("tab", { name: question, exact: true })).toHaveAttribute("data-selected", "")
    await expect(panel.getByText("Saved overflow answer", { exact: true })).toBeVisible()
  }

  await expect(page.getByRole("tab", { name: /^Side \d+:/ })).toHaveCount(12)
  await expect(panel.getByRole("textbox")).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("tab", { name: /^Side \d+:/ })).toHaveCount(12)
  await expect(panel.getByText("Saved overflow answer", { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("narrow-many-tabs.png") })
})

test("answers /btw in the side panel without admitting a prompt", async ({ page }) => {
  const generations: { sessionID: string; prompt: string }[] = []
  const prompts: unknown[] = []
  const generated = Promise.withResolvers<void>()
  const leftBehind = Promise.withResolvers<void>()
  const main = { id: "ses_btw_sidebar", title: "Side question session" }
  const other = { id: "ses_btw_sidebar_other", title: "Other side question session" }
  const ownerWarnings: string[] = []
  page.on("console", (message) => {
    if (message.text().includes("computations created outside a `createRoot` or `render`"))
      ownerWarnings.push(message.text())
  })

  const { editor } = await openSession(page, {
    name: "BtwSidebar",
    sessions: [main, other],
    onPrompt: (input) => prompts.push(input),
    generate: async (input) => {
      generations.push(input)

      if (input.sessionID === other.id) return { text: "This answer belongs to the **other session**." }

      if (input.prompt.includes("left behind")) {
        await leftBehind.promise

        return { text: "This answer arrived after the user left." }
      }

      await generated.promise

      return {
        text: "The retry loop uses **exponential backoff** and stops after three attempts.\n\n```ts\nconst delay = 2 ** attempt\n```",
      }
    },
  })

  await editor.fill("/btw")
  const suggestion = page.locator('[data-suggestion-id="btw.ask"]')
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(editor).toHaveText("/btw ")
  await editor.press("Enter")
  const panel = page.locator('[data-slot="session-btw-panel"]')
  await expect(panel).toBeHidden()
  await expect(page.getByText("Add a question after /btw", { exact: true })).toBeVisible()
  expect(generations).toEqual([])
  expect(prompts).toEqual([])

  await editor.fill("/btw how does the retry loop work?")
  await editor.press("Enter")
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("textbox")).toHaveCount(0)
  await expect(panel.getByRole("status")).toContainText("Working")
  await expect(page.getByRole("tab", { name: "how does the retry loop work?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  generated.resolve()
  await expect(panel.getByText("how does the retry loop work?", { exact: true })).toBeVisible()
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await expect(panel.getByText("const delay = 2 ** attempt", { exact: true })).toBeVisible()
  expect(generations).toHaveLength(1)
  expect(generations[0]?.sessionID).toBe(main.id)
  expect(generations[0]?.prompt).toContain("how does the retry loop work?")
  expect(prompts).toEqual([])
  await expect(editor).toHaveText("")

  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(other.id)}"]`).click()
  await expectSessionTitle(page, other.title)
  await editor.fill("/btw what belongs here?")
  await editor.press("Enter")
  await expect(panel.getByText("other session", { exact: false })).toBeVisible()
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await expect(panel.getByText("other session", { exact: false })).toHaveCount(0)

  await editor.fill("/btw is this question left behind?")
  await editor.press("Enter")
  await expect(panel.getByRole("status")).toContainText("Working")
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(other.id)}"]`).click()
  await expectSessionTitle(page, other.title)
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  // Leaving the session does not abandon its question: it is still working, and its answer lands once it arrives.
  await expect(panel.getByRole("status")).toContainText("Working")
  await page.getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  leftBehind.resolve()
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(panel.getByText("This answer arrived after the user left.", { exact: true })).toBeVisible()
  await expect(panel.getByText("Couldn’t answer that question", { exact: true })).toHaveCount(0)
  expect(generations.filter((item) => item.prompt.includes("left behind"))).toHaveLength(1)

  await page.reload()
  await expectSessionTitle(page, main.title)
  await expect(page.getByRole("tab", { name: "is this question left behind?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  await expect(panel.getByText("This answer arrived after the user left.", { exact: true })).toBeVisible()
  await expect(panel.getByRole("status")).toHaveCount(0)
  await page.getByRole("tab", { name: "how does the retry loop work?", exact: true }).click()
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.locator(`[data-titlebar-tab-link][href="${sessionHref(main.id)}"]`).click()
  await expectSessionTitle(page, main.title)
  await expect(page.getByRole("tab", { name: "how does the retry loop work?", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  await expect(panel.getByText("exponential backoff", { exact: false })).toBeVisible()
  expect(ownerWarnings).toEqual([])
})
