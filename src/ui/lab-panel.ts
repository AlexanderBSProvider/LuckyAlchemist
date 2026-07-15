import "./lab-panel.css";
import { upgradeCost } from "../core/economy";
import type { Rng } from "../core/rng";
import {
  ashSiftConfig,
  distillationStages,
  ingredients,
  mutationConfig,
  rings,
  stages,
  symbols,
  upgrades,
} from "../data";
import { glyphFor } from "../data/glyphs";
import type { GradeId, RarityTier } from "../data/schemas";
import { performBrew, performDistill, performSift } from "../store/actions";
import { buyUpgrade, equipPotion, unequipPotion } from "../store/commands";
import type { EventBus, GameEventMap } from "../store/events";
import type { GameState } from "../store/game-state";
import { playerPower } from "../store/selectors";
import type { Store } from "../store/store";
import { createAshScratch } from "./ash-scratch";
import { ingredientIconEl } from "./ingredient-icons";

export interface LabPanelDeps {
  store: Store<GameState>;
  events: EventBus<GameEventMap>;
  siftRng: Rng;
  brewRng: Rng;
  distillRng: Rng;
}

const RARITY_LABELS: Record<RarityTier, string> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
  quintessence: "quintessence",
};

const GRADE_LABELS: Record<GradeId, string> = {
  tincture: "tincture",
  elixir: "elixir",
  "grand-elixir": "grand elixir",
  quintessence: "quintessence",
};

function ingredientLabel(id: string): string {
  return ingredients.find((ingredient) => ingredient.id === id)?.label ?? id;
}

function symbolLabel(id: string): string {
  return symbols.find((symbol) => symbol.id === id)?.label ?? id;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Restarts a one-shot CSS animation by re-adding its class after a forced reflow. */
function pulse(node: HTMLElement): void {
  node.classList.remove("pulse");
  void node.offsetWidth;
  node.classList.add("pulse");
}

/*
 * Visual-only randomness for the brew-scene replay. The real outcome is already resolved
 * in core behind the injected Rng by the time these run — they only dress up the rings
 * animation (e.g. which decoy glyph shows on a near-miss) and never touch game odds.
 */
function visualPick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("visualPick: empty list");
  return item;
}

function visualShuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

type SceneBrewOutcome =
  { kind: "success"; symbolId: string; rarity: RarityTier; triple: boolean } | { kind: "fail" };

const TAB_IDS = ["brew", "potions", "lab"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  brew: "Brew",
  potions: "Potions",
  lab: "Lab",
};

/** Tab icons — engraved unicode glyphs, same no-asset convention as data/glyphs.ts. */
const TAB_ICONS: Record<TabId, string> = {
  brew: "⚗",
  potions: "🜛",
  lab: "🜍",
};

/** The alchemist's own face glyph, mirrored from render/battle-scene.ts's ALCHEMIST_GLYPH. */
const HERO_GLYPH = "🧙";

export interface LabPanelHandle {
  /** Screen region `render/battle-scene.ts` draws the autobattler arena into. Exposed so
   * `main.ts` can wire ui and render together without them importing each other
   * (ARCHITECTURE.md §1/§6). */
  battleAnchor: HTMLElement;
  /** Screen region `render/cauldron-scene.ts` draws the cauldron + symbol rings into. */
  cauldronAnchor: HTMLElement;
  cleanup: () => void;
}

/**
 * Stage 1 game screen, composed like a playable-ad: the top half is the persistent
 * autobattler scene (alchemist vs the current stage's foe, fighting on its own — Three.js
 * draws it into `battleAnchor`), the bottom is the compact control deck — resource HUD,
 * tab bar, and the action panels: brewing (with the Three.js cauldron in `cauldronAnchor`),
 * potion shelf with mutation slots, laboratory (upgrades + ash sifting).
 */
export function mountLabPanel(container: HTMLElement, deps: LabPanelDeps): LabPanelHandle {
  const { store, events, siftRng, brewRng, distillRng } = deps;

  const root = el("section", "lab-panel");

  // --- Resource HUD -------------------------------------------------------------------
  // Outlined-number pattern (see grimoire.css `.text-holder`): two identical spans, the
  // absolute one painted as a thick stroke under the filled one — game-style HUD digits.
  const makeOutlinedText = (): { holder: HTMLElement; set: (text: string) => void } => {
    const holder = el("span", "text-holder");
    const outline = el("span", "text outline");
    outline.setAttribute("aria-hidden", "true");
    const fill = el("span", "text");
    holder.append(outline, fill);
    return {
      holder,
      set: (text) => {
        outline.textContent = text;
        fill.textContent = text;
      },
    };
  };

  const hud = el("div", "hud");
  const goldChip = el("span", "hud__res hud__res--gold");
  goldChip.title = "Gold";
  const goldText = makeOutlinedText();
  goldChip.append(goldText.holder);
  const ashChip = el("span", "hud__res hud__res--ash");
  ashChip.title = "Ash";
  const ashText = makeOutlinedText();
  ashChip.append(ashText.holder);
  hud.append(goldChip, ashChip);

  // Hero medallion (top-left of the scene, like the reference's avatar+level): the
  // alchemist's face plus a live power readout, updated in renderStage.
  const hero = el("div", "hero-badge");
  const heroFace = el("span", "hero-badge__face", HERO_GLYPH);
  const heroMeta = el("div", "hero-badge__meta");
  const heroName = el("span", "hero-badge__name", "Alchemist");
  const heroPower = el("span", "hero-badge__power");
  heroMeta.append(heroName, heroPower);
  hero.append(heroFace, heroMeta);

  // --- Battle scene (top, always visible) -----------------------------------------------
  // `battleAnchor` is an empty box: `render/battle-scene.ts` draws the arena into its
  // screen rect every frame. The DOM here is only the thin overlay on top of the scene —
  // stage progress, win-chance meter, and the victory banner.
  const scene = el("section", "scene");
  const battleAnchor = el("div", "scene__battle");
  // Top overlay bar: hero medallion (left) balanced against the currency chips (right),
  // both floating over the Three.js arena like the reference's HUD.
  const sceneTopBar = el("div", "scene__topbar");
  sceneTopBar.append(hero, hud);
  const sceneHead = el("div", "scene__head");
  const stageLine = el("p", "scene__stage");
  const stageTrack = el("div", "stage-track");
  sceneHead.append(stageLine, stageTrack);
  const sceneFoot = el("div", "scene__foot");
  const meter = el("div", "meter");
  const meterFill = el("div", "meter__fill");
  meter.append(meterFill);
  const chanceLine = el("p", "scene__chance");
  const rewardLine = el("p", "scene__reward");
  sceneFoot.append(meter, chanceLine, rewardLine);
  const battleResultBox = el("div", "scene__result");
  scene.append(battleAnchor, sceneTopBar, sceneHead, sceneFoot, battleResultBox);

  // --- Brew panel (cauldron lives here, like the reference's anvil) ---------------------
  // The rolls row and result banner overlay the cauldron (absolute children) rather than
  // sitting as flow blocks — that way they reserve no vertical space when idle, so the brew
  // tab fits small screens without scrolling. The cauldron canvas is drawn behind all DOM
  // (fixed background layer), so these overlays render on top of it.
  const brewPanel = el("div", "panel panel--brew");
  const cauldronAnchor = el("div", "brew-cauldron");
  const rollsRow = el("div", "scene__rolls");
  const bannerBox = el("div", "scene__banner");
  cauldronAnchor.append(rollsRow, bannerBox);
  const brewHint = el(
    "p",
    "panel__hint",
    "The base feeds the fire; additives shift the symbol weights.",
  );
  const brewList = el("ul", "chips");
  const brewButton = el("button", "cta", "Brew");
  brewButton.type = "button";
  brewPanel.append(cauldronAnchor, brewHint, brewList, brewButton);

  // --- Potions panel ---------------------------------------------------------------
  const potionsPanel = el("div", "panel");
  const slotsHint = el("p", "panel__hint");
  const slotsRow = el("div", "slots");
  const potionsList = el("ul", "potions-list");
  potionsPanel.append(slotsHint, slotsRow, potionsList);

  // --- Laboratory panel (upgrades + ash sifting) --------------------------------------
  const labPanel = el("div", "panel");
  const shopList = el("ul", "shop-list");
  const siftRow = el("div", "sift-row");
  const siftInfo = el("p", "panel__hint");
  const siftButton = el("button", "btn-small", "Sift ash");
  siftButton.type = "button";
  siftRow.append(siftInfo, siftButton);
  const siftCardSlot = el("div", "");
  labPanel.append(shopList, siftRow, siftCardSlot);

  // `renderSift` (defined below, after `ashScratch` is created) is the real callback —
  // this indirection just lets the canvas be built here, next to its trigger button, without
  // reordering the whole render-function section.
  let notifySiftSettled = (): void => {
    /* replaced once renderAll exists */
  };
  const ashScratch = createAshScratch(siftCardSlot, () => {
    notifySiftSettled();
  });

  // --- Tab bar -----------------------------------------------------------------------
  const panels: Record<TabId, HTMLElement> = {
    brew: brewPanel,
    potions: potionsPanel,
    lab: labPanel,
  };
  const tabsNav = el("nav", "tabs");
  const tabButtons = {} as Record<TabId, HTMLButtonElement>;
  for (const id of TAB_IDS) {
    const tabButton = el("button", "tabs__btn");
    tabButton.type = "button";
    tabButton.append(
      el("span", "tabs__icon", TAB_ICONS[id]),
      el("span", "tabs__label", TAB_LABELS[id]),
    );
    tabButton.addEventListener("click", () => {
      setTab(id);
    });
    tabButtons[id] = tabButton;
    tabsNav.append(tabButton);
  }
  const setTab = (active: TabId): void => {
    for (const id of TAB_IDS) {
      panels[id].hidden = id !== active;
      tabButtons[id].classList.toggle("tabs__btn--active", id === active);
    }
  };
  setTab("brew");

  // hud now lives inside `scene` (top overlay); the deck below the scene is just the tab
  // bar and the active panel.
  root.append(scene, tabsNav, brewPanel, potionsPanel, labPanel);
  container.append(root);

  // --- Renders ------------------------------------------------------------------------
  let prevGold: number | null = null;
  let prevAsh: number | null = null;

  const renderResources = (state: GameState): void => {
    const { gold, ash } = state.resources;
    goldText.set(`☉ ${String(gold)}`);
    ashText.set(`Ash ${String(ash)}`);
    if (prevGold !== null && gold !== prevGold) pulse(goldChip);
    if (prevAsh !== null && ash !== prevAsh) pulse(ashChip);
    prevGold = gold;
    prevAsh = ash;
  };

  const renderStageTrack = (state: GameState): void => {
    stageTrack.replaceChildren(
      ...stages.map((stage) => {
        const cleared = stage.id < state.currentStageId;
        const current = stage.id === state.currentStageId;
        const dot = el(
          "span",
          `stage-track__dot${cleared ? " stage-track__dot--cleared" : ""}${current ? " stage-track__dot--current" : ""}`,
        );
        return dot;
      }),
    );
  };

  const renderStage = (state: GameState): void => {
    renderStageTrack(state);
    const stage = stages.find((candidate) => candidate.id === state.currentStageId);
    const power = playerPower(state);
    heroPower.textContent = `⚔ ${String(power)}`;
    if (!stage) {
      stageLine.textContent = "All battles cleared";
      meterFill.style.width = "100%";
      chanceLine.textContent = `Power: ${String(power)}`;
      rewardLine.textContent = "";
      return;
    }
    // Under auto-battle the percentage is usually tiny at a wall — the meter reads as
    // "how close your power is to this foe", which is the honest signal to show.
    const winChance = Math.round((100 * power) / (power + stage.difficulty));
    stageLine.textContent = `Battle 1-${String(stage.id)}`;
    meterFill.style.width = `${String(Math.max(2, winChance))}%`;
    chanceLine.textContent = `Power ${String(power)} vs ${String(stage.difficulty)}`;
    rewardLine.replaceChildren(
      `Reward: ${String(stage.rewardGold)} ☉ + ${String(stage.rewardIngredientAmount)} `,
    );
    const rewardIcon = ingredientIconEl(stage.rewardIngredientId, "scene__reward-icon");
    if (rewardIcon) rewardLine.append(rewardIcon);
    rewardLine.append(ingredientLabel(stage.rewardIngredientId));
  };

  let brewLocked = false;

  const renderBrew = (state: GameState): void => {
    const availableIds = Object.entries(state.resources.ingredients)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id);

    brewList.replaceChildren(
      ...availableIds.map((id) => {
        const item = el("li");
        const chip = el("label", "chip");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.value = id;
        const amount = state.resources.ingredients[id] ?? 0;
        const face = el("span", "chip__face");
        const icon = ingredientIconEl(id, "chip__icon");
        if (icon) face.append(icon);
        face.append(`${ingredientLabel(id)} ×${String(amount)}`);
        chip.append(checkbox, face);
        item.append(chip);
        return item;
      }),
    );
    brewButton.disabled = brewLocked || availableIds.length === 0;
  };

  const renderPotions = (state: GameState): void => {
    const equipped = state.potions.filter((potion) => potion.equipped);
    slotsHint.textContent = `Mutations: ${String(equipped.length)}/${String(mutationConfig.maxEquippedSlots)}`;

    slotsRow.replaceChildren(
      ...Array.from({ length: mutationConfig.maxEquippedSlots }, (_, i) => {
        const potion = equipped[i];
        if (!potion) return el("span", "slot");
        const slot = el(
          "span",
          `slot slot--filled rar-${potion.rarity}`,
          glyphFor(potion.symbolId),
        );
        slot.title = `${symbolLabel(potion.symbolId)} · ${RARITY_LABELS[potion.rarity]}`;
        return slot;
      }),
    );

    if (state.potions.length === 0) {
      potionsList.replaceChildren(
        el("li", "potions-list__empty", "The shelf is empty — brew your first potion in the cauldron."),
      );
      return;
    }

    potionsList.replaceChildren(
      ...state.potions.map((potion) => {
        const item = el("li", `potion${potion.equipped ? " potion--equipped" : ""}`);
        const tile = el("span", `potion__tile rar-${potion.rarity}`, glyphFor(potion.symbolId));
        const info = el("span", "potion__info");
        const name = el(
          "span",
          "potion__name",
          `${symbolLabel(potion.symbolId)} — ${RARITY_LABELS[potion.rarity]}`,
        );
        const grade = el("span", "potion__grade", GRADE_LABELS[potion.grade]);
        info.append(name, grade);

        const distillButton = el("button", "btn-small", "Distill");
        distillButton.type = "button";
        distillButton.disabled = potion.grade === "quintessence";
        distillButton.addEventListener("click", () => {
          performDistill(store, events, distillRng, distillationStages, potion.id);
        });

        const equipButton = el(
          "button",
          `btn-small${potion.equipped ? "" : " btn-primary"}`,
          potion.equipped ? "Unequip" : "Equip",
        );
        equipButton.type = "button";
        equipButton.disabled =
          !potion.equipped && equipped.length >= mutationConfig.maxEquippedSlots;
        equipButton.addEventListener("click", () => {
          store.dispatch(
            potion.equipped
              ? unequipPotion(potion.id)
              : equipPotion(potion.id, mutationConfig.maxEquippedSlots),
          );
        });

        item.append(tile, info, distillButton, equipButton);
        return item;
      }),
    );
  };

  const renderShop = (state: GameState): void => {
    shopList.replaceChildren(
      ...upgrades.map((upgrade) => {
        const level = state.upgradeLevels[upgrade.id] ?? 0;
        const cost = upgradeCost(upgrade, level);
        const item = el("li", "shop-row");
        const name = el("span", "shop-row__name", upgrade.label);
        const levelBadge = el("span", "shop-row__level", `lv. ${String(level)}`);
        const costTag = el("span", "shop-row__cost", `☉ ${String(cost)}`);
        const buyButton = el("button", "btn-small btn-primary", "Buy");
        buyButton.type = "button";
        buyButton.disabled = state.resources.gold < cost;
        buyButton.addEventListener("click", () => {
          store.dispatch(buyUpgrade(upgrade));
        });
        item.append(name, levelBadge, costTag, buyButton);
        return item;
      }),
    );
  };

  const renderSift = (state: GameState): void => {
    siftInfo.textContent = `Ash to sift: ${String(state.resources.ash)}`;
    siftButton.disabled = state.resources.ash <= 0 || ashScratch.phase() !== "empty";
  };

  const renderAll = (): void => {
    const state = store.getState();
    renderResources(state);
    renderStage(state);
    renderBrew(state);
    renderPotions(state);
    renderShop(state);
    renderSift(state);
  };
  renderAll();
  notifySiftSettled = renderAll;

  const unsubscribeResources = store.subscribe((state) => state.resources, renderAll);
  const unsubscribeStage = store.subscribe((state) => state.currentStageId, renderAll);
  const unsubscribeUpgrades = store.subscribe((state) => state.upgradeLevels, renderAll);
  const unsubscribePotions = store.subscribe((state) => state.potions, renderAll);

  // --- Brew scene replay ----------------------------------------------------------------
  const playBrewScene = (outcome: SceneBrewOutcome): void => {
    brewLocked = true;
    renderBrew(store.getState());

    const symbolIds = symbols.map((symbol) => symbol.id);
    let rolls: { symbolId: string; hit: boolean }[];
    if (outcome.kind === "success") {
      const hit = { symbolId: outcome.symbolId, hit: true };
      rolls = outcome.triple
        ? [hit, hit, hit]
        : // Near-miss staging: the decoy lands last, after two matches raised hopes.
          [
            hit,
            hit,
            {
              symbolId: visualPick(symbolIds.filter((id) => id !== outcome.symbolId)),
              hit: false,
            },
          ];
    } else {
      rolls = visualShuffle(symbolIds)
        .slice(0, 3)
        .map((symbolId) => ({ symbolId, hit: false }));
    }

    rollsRow.replaceChildren(
      ...rolls.map((roll, i) => {
        const rarityClass = outcome.kind === "success" ? ` rar-${outcome.rarity}` : "";
        const node = el(
          "span",
          `roll ${roll.hit ? `roll--hit${rarityClass}` : "roll--miss"}`,
          glyphFor(roll.symbolId),
        );
        node.style.animationDelay = `${String(0.9 + i * 0.45)}s`;
        return node;
      }),
    );

    const banner =
      outcome.kind === "success"
        ? el(
            "p",
            `scene__banner-text rar-${outcome.rarity}`,
            `Brewed: ${RARITY_LABELS[outcome.rarity]} "${symbolLabel(outcome.symbolId)}"` +
              (outcome.triple ? " — triple match!" : ""),
          )
        : el(
            "p",
            "scene__banner-text scene__banner-text--fail",
            "No match — ingredients burned to ash.",
          );
    banner.addEventListener(
      "animationend",
      () => {
        brewLocked = false;
        renderBrew(store.getState());
      },
      { once: true },
    );
    bannerBox.replaceChildren(banner);
  };

  // --- Victory banner over the battle scene ----------------------------------------------
  // The fight itself is drawn by `render/battle-scene.ts`; the DOM only floats the reward
  // text on a win. Losses show no banner — under auto-battle they repeat every few seconds
  // at a power wall, and a "Defeat..." toast on each would be pure noise.
  const showVictoryBanner = (reward: {
    gold: number;
    ingredientId: string;
    ingredientAmount: number;
  }): void => {
    const result = el(
      "p",
      "scene__result-text rar-legendary",
      `+${String(reward.gold)} ☉  +${String(reward.ingredientAmount)} ${ingredientLabel(reward.ingredientId)}`,
    );
    result.addEventListener(
      "animationend",
      () => {
        result.remove();
      },
      { once: true },
    );
    battleResultBox.replaceChildren(result);
  };

  // Outcome events fire synchronously inside performFight/performBrew (see
  // store/actions.ts) — performFight is driven by the auto-battle interval in `main.ts`.
  const unsubscribeBattleWon = events.on(
    "battle:won",
    ({ rewardGold, rewardIngredientId, rewardIngredientAmount }) => {
      showVictoryBanner({
        gold: rewardGold,
        ingredientId: rewardIngredientId,
        ingredientAmount: rewardIngredientAmount,
      });
    },
  );
  const unsubscribeBrewSuccess = events.on("brew:success", ({ symbolId, rarity, triple }) => {
    playBrewScene({ kind: "success", symbolId, rarity, triple });
  });
  const unsubscribeBrewFail = events.on("brew:fail", () => {
    playBrewScene({ kind: "fail" });
  });

  brewButton.addEventListener("click", () => {
    if (brewLocked) return;
    const checked = brewList.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked");
    const ingredientIds = [...checked].map((input) => input.value);
    if (ingredientIds.length === 0) return;

    performBrew(store, events, brewRng, { rings, symbols, ingredients }, { ingredientIds });
  });

  const unsubscribeAshSifted = events.on("ash:sifted", ({ ingredientId, amount }) => {
    ashScratch.arm({ label: ingredientLabel(ingredientId), amount });
    renderAll();
  });

  siftButton.addEventListener("click", () => {
    const ash = store.getState().resources.ash;
    if (ash <= 0 || ashScratch.phase() !== "empty") return;
    performSift(store, events, siftRng, ashSiftConfig, ash);
  });

  return {
    battleAnchor,
    cauldronAnchor,
    cleanup: () => {
      unsubscribeResources();
      unsubscribeStage();
      unsubscribeUpgrades();
      unsubscribePotions();
      unsubscribeBattleWon();
      unsubscribeBrewSuccess();
      unsubscribeBrewFail();
      unsubscribeAshSifted();
      ashScratch.destroy();
      root.remove();
    },
  };
}
