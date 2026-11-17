const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.options = this.children;
    this.listeners = {};
    this.value = "";
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(value) {
    this.html = value;
    this.children.length = 0;
  }

  appendChild(child) {
    this.children.push(child);
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  setAttribute() {}
}

async function setup({ delayRefresh = false } = {}) {
  const elements = Object.fromEntries(
    ["activities-list", "activity", "signup-form", "message", "email"].map(
      (id) => [id, new Element()]
    )
  );
  elements.activity.appendChild(new Element());
  elements["signup-form"].reset = () => {
    elements.activity.value = "";
    elements.email.value = "";
  };
  const activities = {
    Chess: {
      description: "Play chess",
      schedule: "Friday",
      max_participants: 12,
      participants: [],
    },
  };
  let ready;
  let releaseRefresh;
  let loads = 0;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/static/app.js"), "utf8"),
    {
      document: {
        getElementById: (id) => elements[id],
        createElement: () => new Element(),
        addEventListener: (event, callback) => { ready = callback; },
      },
      fetch: async (url, options) => {
        if (options?.method === "POST") {
          activities.Chess.participants.push(
            new URL(url, "http://localhost").searchParams.get("email")
          );
          return { ok: true, json: async () => ({ message: "Signed up" }) };
        }
        const snapshot = structuredClone(activities);
        loads += 1;
        if (delayRefresh && loads === 2) {
          await new Promise((resolve) => { releaseRefresh = resolve; });
        }
        return { ok: true, json: async () => snapshot };
      },
      setTimeout() {},
      console,
    }
  );
  ready();
  await new Promise(setImmediate);
  return { elements, releaseOlderLoad: () => releaseRefresh() };
}

async function signup(elements, email = "new@example.edu") {
  elements.activity.value = "Chess";
  elements.email.value = email;
  await elements["signup-form"].listeners.submit({ preventDefault() {} });
}

function assertUpdatedCard(elements, emails = ["new@example.edu"]) {
  const cards = elements["activities-list"].children;
  assert.equal(cards.length, 1);
  assert.ok(cards[0].html.includes(`${12 - emails.length} spots left`));
  const section = cards[0].children[0];
  assert.equal(section.children[0].textContent, `Participants (${emails.length})`);
  assert.deepEqual(
    section.children[1].children.map((participant) => participant.children[0].textContent),
    emails
  );
  assert.equal(elements.activity.options.length, 2);
}

test("signup updates participants and availability without reloading the page", async () => {
  const { elements } = await setup();
  await signup(elements);
  assertUpdatedCard(elements);
});

test("a delayed older activity response cannot undo the signup update", async () => {
  const { elements, releaseOlderLoad } = await setup({ delayRefresh: true });
  const firstSignup = signup(elements);
  await new Promise(setImmediate);
  await signup(elements, "second@example.edu");
  const emails = ["new@example.edu", "second@example.edu"];
  assertUpdatedCard(elements, emails);
  releaseOlderLoad();
  await firstSignup;
  assertUpdatedCard(elements, emails);
});
