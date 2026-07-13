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
import { performBrew, performDistill } from "../store/actions";
import { buyUpgrade, equipPotion, siftAshCommand, unequipPotion } from "../store/commands";
import type { EventBus, GameEventMap } from "../store/events";
import type { GameState } from "../store/game-state";
import { playerPower } from "../store/selectors";
import type { Store } from "../store/store";

export interface LabPanelDeps {
  store: Store<GameState>;
  events: EventBus<GameEventMap>;
  siftRng: Rng;
  brewRng: Rng;
  distillRng: Rng;
}

const RARITY_LABELS: Record<RarityTier, string> = {
  common: "звичайний",
  uncommon: "незвичайний",
  rare: "рідкісний",
  epic: "епічний",
  legendary: "легендарний",
  quintessence: "квінтесенційний",
};

const GRADE_LABELS: Record<GradeId, string> = {
  tincture: "настойка",
  elixir: "еліксир",
  "grand-elixir": "великий еліксир",
  quintessence: "квінтесенція",
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
  brew: "Казан",
  potions: "Зілля",
  lab: "Лабораторія",
};

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
  goldChip.title = "Золото";
  const goldText = makeOutlinedText();
  goldChip.append(goldText.holder);
  const ashChip = el("span", "hud__res hud__res--ash");
  ashChip.title = "Попіл";
  const ashText = makeOutlinedText();
  ashChip.append(ashText.holder);
  hud.append(goldChip, ashChip);

  // --- Battle scene (top, always visible) -----------------------------------------------
  // `battleAnchor` is an empty box: `render/battle-scene.ts` draws the arena into its
  // screen rect every frame. The DOM here is only the thin overlay on top of the scene —
  // stage progress, win-chance meter, and the victory banner.
  const scene = el("section", "scene");
  const battleAnchor = el("div", "scene__battle");
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
  scene.append(battleAnchor, sceneHead, sceneFoot, battleResultBox);

  // --- Brew tab (cauldron lives here, like the reference's anvil) -----------------------
  // `cauldronAnchor` sits *outside* `.panel` on purpose: `.panel` has an opaque background
  // (grimoire.css), which would paint over `render/three-app.ts`'s canvas and hide the
  // cauldron scene the same way `.scene` (the battle arena) deliberately avoids doing.
  const brewTab = el("div", "brew-tab");
  const cauldronAnchor = el("div", "brew-cauldron");
  const brewPanel = el("div", "panel");
  const rollsRow = el("div", "scene__rolls");
  const bannerBox = el("div", "scene__banner");
  const brewHint = el(
    "p",
    "panel__hint",
    "Обери інгредієнти: база живить вогонь, добавки зміщують ваги символів.",
  );
  const brewList = el("ul", "chips");
  const brewButton = el("button", "cta", "Варити");
  brewButton.type = "button";
  brewPanel.append(rollsRow, bannerBox, brewHint, brewList, brewButton);
  brewTab.append(cauldronAnchor, brewPanel);

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
  const siftButton = el("button", "btn-small", "Просіяти попіл");
  siftButton.type = "button";
  siftRow.append(siftInfo, siftButton);
  labPanel.append(shopList, siftRow);

  // --- Tab bar -----------------------------------------------------------------------
  const panels: Record<TabId, HTMLElement> = {
    brew: brewTab,
    potions: potionsPanel,
    lab: labPanel,
  };
  const tabsNav = el("nav", "tabs");
  const tabButtons = {} as Record<TabId, HTMLButtonElement>;
  for (const id of TAB_IDS) {
    const tabButton = el("button", "tabs__btn", TAB_LABELS[id]);
    tabButton.type = "button";
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

  root.append(scene, hud, tabsNav, brewPanel, potionsPanel, labPanel);
  container.append(root);

  // --- Renders ------------------------------------------------------------------------
  let prevGold: number | null = null;
  let prevAsh: number | null = null;

  const renderResources = (state: GameState): void => {
    const { gold, ash } = state.resources;
    goldText.set(`☉ ${String(gold)}`);
    ashText.set(`Попіл ${String(ash)}`);
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
    if (!stage) {
      stageLine.textContent = "Усі стейджі зачищено";
      meterFill.style.width = "100%";
      chanceLine.textContent = `Сила: ${String(power)}`;
      rewardLine.textContent = "";
      return;
    }
    // Under auto-battle the percentage is usually tiny at a wall — the meter reads as
    // "how close your power is to this foe", which is the honest signal to show.
    const winChance = Math.round((100 * power) / (power + stage.difficulty));
    stageLine.textContent = `Стейдж ${String(stage.id)} / ${String(stages.length)}`;
    meterFill.style.width = `${String(Math.max(2, winChance))}%`;
    chanceLine.textContent = `Сила ${String(power)} проти ${String(stage.difficulty)}`;
    rewardLine.textContent =
      `Нагорода: ${String(stage.rewardGold)} ☉ + ${String(stage.rewardIngredientAmount)} ` +
      ingredientLabel(stage.rewardIngredientId);
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
        const face = el("span", "chip__face", `${ingredientLabel(id)} ×${String(amount)}`);
        chip.append(checkbox, face);
        item.append(chip);
        return item;
      }),
    );
    brewButton.disabled = brewLocked || availableIds.length === 0;
  };

  const renderPotions = (state: GameState): void => {
    const equipped = state.potions.filter((potion) => potion.equipped);
    slotsHint.textContent = `Мутації: ${String(equipped.length)}/${String(mutationConfig.maxEquippedSlots)}`;

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
        el("li", "potions-list__empty", "Полиця порожня — звари перше зілля в казані."),
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

        const distillButton = el("button", "btn-small", "Дистилювати");
        distillButton.type = "button";
        distillButton.disabled = potion.grade === "quintessence";
        distillButton.addEventListener("click", () => {
          performDistill(store, events, distillRng, distillationStages, potion.id);
        });

        const equipButton = el("button", "btn-small", potion.equipped ? "Зняти" : "Екіпірувати");
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
        const levelBadge = el("span", "shop-row__level", `рів. ${String(level)}`);
        const costTag = el("span", "shop-row__cost", `☉ ${String(cost)}`);
        const buyButton = el("button", "btn-small", "Купити");
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
    siftInfo.textContent = `Попіл на просіювання: ${String(state.resources.ash)}`;
    siftButton.disabled = state.resources.ash <= 0;
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
            `Зварено: ${RARITY_LABELS[outcome.rarity]} «${symbolLabel(outcome.symbolId)}»` +
              (outcome.triple ? " — потрійний збіг!" : ""),
          )
        : el(
            "p",
            "scene__banner-text scene__banner-text--fail",
            "Збігу немає — інгредієнти згоріли в попіл.",
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
  // at a power wall, and a "Поразка..." toast on each would be pure noise.
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

  siftButton.addEventListener("click", () => {
    const ash = store.getState().resources.ash;
    if (ash <= 0) return;
    store.dispatch(siftAshCommand(siftRng, ashSiftConfig, ash));
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
      root.remove();
    },
  };
}
