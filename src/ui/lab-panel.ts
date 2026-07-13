import "./lab-panel.css";
import { estimatePlayerPower, upgradeCost } from "../core/economy";
import { equippedPower } from "../core/mutations";
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
import type { GradeId, RarityTier } from "../data/schemas";
import {
  buyUpgrade,
  brewCommand,
  distillPotion,
  equipPotion,
  fightStage,
  siftAshCommand,
  unequipPotion,
} from "../store/commands";
import type { GameState } from "../store/game-state";
import type { Store } from "../store/store";

export interface LabPanelDeps {
  store: Store<GameState>;
  battleRng: Rng;
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

/** Engraved alchemical glyphs for era-1 symbols — unicode, no art assets (GAME-DESIGN §8). */
const SYMBOL_GLYPHS: Record<string, string> = {
  fire: "🜂",
  earth: "🜃",
  water: "🜄",
  metal: "🜛",
  spirit: "🜍",
};

function glyphFor(id: string): string {
  return SYMBOL_GLYPHS[id] ?? "✶";
}

/** Cosmetic-only bestiary for the battle arena — cycles by stage id, no balance data. */
const BESTIARY = ["🐀", "🦇", "🕷️", "🐍", "👹", "🦂", "🐺", "👺", "🐉", "💀"];

function foeGlyphFor(stageId: number): string {
  return BESTIARY[(stageId - 1) % BESTIARY.length] ?? "👹";
}

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

const TAB_IDS = ["brew", "battle", "potions", "lab"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  brew: "Казан",
  battle: "Битва",
  potions: "Зілля",
  lab: "Лабораторія",
};

/**
 * Stage 1 game screen, portrait mobile-game layout: resource HUD on top, the persistent
 * cauldron scene (three slowly turning symbol rings that burst and reveal the brew's
 * rolls), then a tab bar switching the action panels — brewing recipe, autobattler stage,
 * potion shelf with mutation slots, and the laboratory (upgrades + ash sifting). Each
 * primary action is one big banner CTA. The Pixi renderer will later replace the CSS
 * scene; the HUD and panels stay DOM.
 */
export function mountLabPanel(container: HTMLElement, deps: LabPanelDeps): () => void {
  const { store, battleRng, siftRng, brewRng, distillRng } = deps;

  const root = el("section", "lab-panel");

  // --- Resource HUD -------------------------------------------------------------------
  const hud = el("div", "hud");
  const goldChip = el("span", "hud__res hud__res--gold");
  goldChip.title = "Золото";
  const ashChip = el("span", "hud__res hud__res--ash");
  ashChip.title = "Попіл";
  hud.append(goldChip, ashChip);

  // --- Cauldron scene -------------------------------------------------------------------
  const scene = el("section", "scene");
  const ringsWrap = el("div", "scene__rings");
  ["ring--outer", "ring--mid", "ring--inner"].forEach((ringClass, ringIndex) => {
    const ring = el("div", `ring ${ringClass}`);
    symbols.forEach((symbol, i) => {
      const arm = el("div", "ring__arm");
      arm.style.setProperty("--angle", `${String((360 / symbols.length) * i + ringIndex * 24)}deg`);
      arm.append(el("span", "ring__glyph", glyphFor(symbol.id)));
      ring.append(arm);
    });
    ringsWrap.append(ring);
  });
  const cauldron = el("div", "cauldron");
  cauldron.append(
    el("span", "cauldron__bubble"),
    el("span", "cauldron__bubble"),
    el("span", "cauldron__bubble"),
  );
  ringsWrap.append(cauldron);
  const rollsRow = el("div", "scene__rolls");
  const bannerBox = el("div", "scene__banner");
  scene.append(ringsWrap, rollsRow, bannerBox);

  // --- Brew panel -------------------------------------------------------------------
  const brewPanel = el("div", "panel");
  const brewHint = el(
    "p",
    "panel__hint",
    "Обери інгредієнти: база живить вогонь, добавки зміщують ваги символів.",
  );
  const brewList = el("ul", "chips");
  const brewButton = el("button", "cta", "Варити");
  brewButton.type = "button";
  brewPanel.append(brewHint, brewList, brewButton);

  // --- Battle panel -------------------------------------------------------------------
  const battlePanel = el("div", "panel");
  const stageTrack = el("div", "stage-track");
  const stageLine = el("p", "battle__stage");

  const arena = el("div", "arena");
  const fighter = el("span", "arena__fighter", "🧙");
  const clashFx = el("span", "arena__clash", "💥");
  const foe = el("span", "arena__foe");
  const resultBox = el("div", "arena__result");
  arena.append(fighter, clashFx, foe, resultBox);

  const meter = el("div", "meter");
  const meterFill = el("div", "meter__fill");
  meter.append(meterFill);
  const chanceLine = el("p", "battle__chance");
  const rewardLine = el("p", "panel__hint");
  const fightButton = el("button", "cta", "У бій");
  fightButton.type = "button";
  battlePanel.append(stageTrack, stageLine, arena, meter, chanceLine, rewardLine, fightButton);

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
    brew: brewPanel,
    battle: battlePanel,
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

  root.append(hud, scene, tabsNav, brewPanel, battlePanel, potionsPanel, labPanel);
  container.append(root);

  const playerPower = (state: GameState): number =>
    estimatePlayerPower(state.upgradeLevels) + equippedPower(state.potions, mutationConfig);

  // --- Renders ------------------------------------------------------------------------
  let prevGold: number | null = null;
  let prevAsh: number | null = null;

  const renderResources = (state: GameState): void => {
    const { gold, ash } = state.resources;
    goldChip.textContent = `☉ ${String(gold)}`;
    ashChip.textContent = `Попіл ${String(ash)}`;
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
      foe.textContent = "🏆";
      stageLine.textContent = "Усі стейджі зачищено";
      meterFill.style.width = "100%";
      chanceLine.textContent = `Сила: ${String(power)}`;
      rewardLine.textContent = "";
      fightButton.disabled = true;
      return;
    }
    foe.textContent = foeGlyphFor(stage.id);
    const winChance = Math.round((100 * power) / (power + stage.difficulty));
    stageLine.textContent = `Стейдж ${String(stage.id)} / ${String(stages.length)}`;
    meterFill.style.width = `${String(winChance)}%`;
    chanceLine.textContent = `Сила ${String(power)} проти ${String(stage.difficulty)} — шанс перемоги ${String(winChance)}%`;
    rewardLine.textContent =
      `Нагорода: ${String(stage.rewardGold)} золота + ${String(stage.rewardIngredientAmount)} ` +
      ingredientLabel(stage.rewardIngredientId);
    fightButton.disabled = false;
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
          store.dispatch(distillPotion(distillRng, distillationStages, potion.id));
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
    scene.classList.add("scene--brewing");
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
        scene.classList.remove("scene--brewing");
        renderBrew(store.getState());
      },
      { once: true },
    );
    bannerBox.replaceChildren(banner);
  };

  // --- Battle arena replay --------------------------------------------------------------
  let fightLocked = false;

  const playBattleScene = (
    won: boolean,
    reward: { gold: number; ingredientId: string; ingredientAmount: number } | null,
  ): void => {
    fightLocked = true;
    fightButton.disabled = true;
    arena.classList.remove("arena--win", "arena--loss");
    resultBox.replaceChildren();
    void arena.offsetWidth;
    arena.classList.add(won ? "arena--win" : "arena--loss");

    const result = won
      ? el(
          "p",
          "arena__result-text rar-legendary",
          reward
            ? `+${String(reward.gold)} ☉  +${String(reward.ingredientAmount)} ${ingredientLabel(reward.ingredientId)}`
            : "Перемога!",
        )
      : el("p", "arena__result-text arena__result-text--fail", "Поразка...");
    result.addEventListener(
      "animationend",
      () => {
        fightLocked = false;
        renderStage(store.getState());
      },
      { once: true },
    );
    resultBox.append(result);
  };

  fightButton.addEventListener("click", () => {
    if (fightLocked) return;
    const before = store.getState();
    const stage = stages.find((candidate) => candidate.id === before.currentStageId);
    if (!stage) return;
    store.dispatch(fightStage(battleRng, stage, playerPower(before)));
    const won = store.getState().currentStageId > before.currentStageId;
    playBattleScene(
      won,
      won
        ? {
            gold: stage.rewardGold,
            ingredientId: stage.rewardIngredientId,
            ingredientAmount: stage.rewardIngredientAmount,
          }
        : null,
    );
  });

  brewButton.addEventListener("click", () => {
    if (brewLocked) return;
    const checked = brewList.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked");
    const ingredientIds = [...checked].map((input) => input.value);
    if (ingredientIds.length === 0) return;

    const before = store.getState();
    store.dispatch(brewCommand(brewRng, { rings, symbols, ingredients }, { ingredientIds }));
    const after = store.getState();

    if (after.potions.length > before.potions.length) {
      const newest = after.potions[after.potions.length - 1];
      if (!newest) return;
      // A rarity above the symbol's base tier can only come from the triple-match bump.
      const baseRarity = symbols.find((symbol) => symbol.id === newest.symbolId)?.rarity;
      playBrewScene({
        kind: "success",
        symbolId: newest.symbolId,
        rarity: newest.rarity,
        triple: baseRarity !== undefined && baseRarity !== newest.rarity,
      });
    } else if (after.resources.ash > before.resources.ash) {
      playBrewScene({ kind: "fail" });
    }
  });

  siftButton.addEventListener("click", () => {
    const ash = store.getState().resources.ash;
    if (ash <= 0) return;
    store.dispatch(siftAshCommand(siftRng, ashSiftConfig, ash));
  });

  return () => {
    unsubscribeResources();
    unsubscribeStage();
    unsubscribeUpgrades();
    unsubscribePotions();
    root.remove();
  };
}
