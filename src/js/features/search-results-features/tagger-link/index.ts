import bus from "framebus";
import { getURL } from "Browser/runtime";
import Feature from "Feature";
import {
  BUS_EVENTS as events,
  FEATURE_IDS as ids,
  FEATURE_SECTIONS as sections,
} from "Constants";
import iframe from "Lib/iframe";
import createElement from "Lib/create-element";
import { ready as elementReady } from "Lib/mutation";
import { sortByAttribute } from "Lib/sort";
import "./index.css";
import type { TaggerPayload } from "Js/types/tagger";

import {
  TAGGER_SYMBOL,
  ILLUSTRATION_SYMBOL,
  CARD_SYMBOL,
  PRINTING_SYMBOL,
  CREATURE_BODY_SYMBOL,
  DEPICTS_SYMBOL,
  SEEN_BEFORE_SYMBOL,
  BETTER_THAN_SYMBOL,
  COLORSHIFTED_SYMBOL,
  MIRRORS_SYMBOL,
  RELATED_TO_SYMBOL,
  SIMILAR_TO_SYMBOL,
} from "Svg";

const SPINNER_GIF = getURL("spinner.gif");

export interface ShamblesharkRelationship {
  name: string;
  symbol: string;
  liClass?: string;
  isTag?: boolean;
}

type RelationshipCollection = Record<string, ShamblesharkRelationship[]>;

const TAG_SYMBOLS: Record<string, string> = {
  ILLUSTRATION_TAG: ILLUSTRATION_SYMBOL,
  ORACLE_CARD_TAG: CARD_SYMBOL,
  PRINTING_TAG: PRINTING_SYMBOL,
};

const RELATIONSHIP_SYMBOLS: Record<string, string> = {
  BETTER_THAN: BETTER_THAN_SYMBOL,
  COLORSHIFTED: COLORSHIFTED_SYMBOL,
  COMES_AFTER: SEEN_BEFORE_SYMBOL,
  COMES_BEFORE: SEEN_BEFORE_SYMBOL,
  DEPICTED_IN: DEPICTS_SYMBOL,
  DEPICTS: DEPICTS_SYMBOL,
  MIRRORS: MIRRORS_SYMBOL,
  REFERENCED_BY: DEPICTS_SYMBOL,
  REFERENCES_TO: DEPICTS_SYMBOL,
  RELATED_TO: RELATED_TO_SYMBOL,
  SIMILAR_TO: SIMILAR_TO_SYMBOL,
  WITHOUT_BODY: CREATURE_BODY_SYMBOL,
  WITH_BODY: CREATURE_BODY_SYMBOL,
  WORSE_THAN: BETTER_THAN_SYMBOL,
};

const SYMBOLS_THAT_MUST_BE_FLIPPED = {
  WITHOUT_BODY: true,
};

const SYMBOLS_THAT_MUST_BE_REVERSED = {
  COMES_BEFORE: true,
  DEPICTS: true,
  REFERENCES_TO: true,
  BETTER_THAN: true,
};

// TODOS nice to haves
// * handle small screens
// * simple animations when opening the tag menu

function getTaggerData(link: string) {
  const parts = link.split("https://scryfall.com/card/")[1].split("/");

  return {
    set: parts[0],
    number: parts[1],
  };
}

function convertPageLinkToTagger(setCode: string, cardNumber: string) {
  return `https://tagger.scryfall.com/card/${setCode}/${cardNumber}`;
}

class TaggerLink extends Feature {
  // TODO we can probably omit this with a refactor
  // by splitting out the logic for making a button
  // adding it to the page, and creating an iframe
  showPreview: boolean;

  static metadata = {
    id: ids.TaggerLink,
    title: "Tagger Link",
    section: sections.SEARCH_RESULTS,
    description: "Provide a button to card's tagger page from search results.",
    futureFeature: false,
  };

  static settingsDefaults = {
    enabled: true,
    previewTags: true,
  };

  static settingDefinitions = [
    {
      id: "previewTags",
      label: "Show preview of tags for card on hover.",
      input: "checkbox",
    },
  ];

  constructor() {
    super();

    this.showPreview = false;
  }

  async run(): Promise<void> {
    const settings = await TaggerLink.getSettings();
    this.showPreview = Boolean(settings.previewTags);

    if (!this.showPreview) {
      this.setupButtons();

      return;
    }

    bus.on(events.TAGGER_READY, () => {
      this.setupButtons();
    });

    await iframe.create({
      id: "tagger-link-tagger-iframe",
      src: "https://tagger.scryfall.com",
    });
  }

  setupButtons(): void {
    elementReady<HTMLAnchorElement>(
      ".card-grid-item a.card-grid-item-card",
      (link) => {
        const button = this.makeButton(link.href);

        const cardFacesElement = (link.parentNode as HTMLElement).querySelector(
          ".card-grid-item-card-faces"
        ) as HTMLElement;

        cardFacesElement.appendChild(button);
      }
    );
  }

  makeButton(link: string): HTMLAnchorElement {
    const taggerData = getTaggerData(link);
    const taggerLink = convertPageLinkToTagger(
      taggerData.set,
      taggerData.number
    );

    const button = createElement<HTMLAnchorElement>(`<a
      href="${taggerLink}"
      class="tagger-link-button button-n primary icon-only subdued"
      alt="Open in Tagger"
    >
      ${TAGGER_SYMBOL}
    </a>`);

    if (this.showPreview) {
      const tagDisplayMenu = createElement(`<div class="tagger-link-hover">
        <div class="menu-container"></div>
        <img src="${SPINNER_GIF}" class="modal-dialog-spinner" aria-hidden="true">
      </div>`);
      button.prepend(tagDisplayMenu);
      button.addEventListener(
        "mouseover",
        this.createMouseoverHandler(button, taggerData)
      );
    }

    return button;
  }

  createMouseoverHandler(
    button: HTMLAnchorElement,
    taggerData: { set: string; number: string }
  ): (e: MouseEvent) => Promise<void> {
    let request: Promise<void>;

    const tooltip = button.querySelector(
      ".tagger-link-hover"
    ) as HTMLDivElement;

    return (event: MouseEvent) => {
      const pageWidth = document.body.clientWidth;
      const mousePosition = event.pageX;

      // if the mouse position is just over half the page
      // switch tooltip to the left instead of the default right
      if (mousePosition / pageWidth > 0.55) {
        tooltip.classList.add("left-aligned");
      } else {
        tooltip.classList.remove("left-aligned");
      }

      if (!request) {
        request = new Promise((resolve) => {
          bus.emit(events.TAGGER_TAGS_REQUEST, taggerData, resolve);
        }).then((payload) => {
          this.addTags(tooltip, payload as TaggerPayload);
        });
      }

      return request;
    };
  }

  addTags(tooltip: HTMLElement, payload: TaggerPayload): void {
    const menuContainer = tooltip.querySelector(
      ".menu-container"
    ) as HTMLElement;
    const artMenu = document.createElement("ul");
    const cardMenu = document.createElement("ul");
    const spinner = tooltip.querySelector(
      ".modal-dialog-spinner"
    ) as HTMLElement;

    const tags = this.collectTags(payload);
    const relationships = this.collectRelationships(payload);
    const artEntries = tags.art.concat(tags.print).concat(relationships.art);
    const oracleEntries = tags.oracle.concat(relationships.oracle);

    spinner.classList.add("hidden");

    if (artEntries.length) {
      menuContainer.appendChild(artMenu);
      this.addTagsToMenu(artEntries, artMenu);
    }

    if (oracleEntries.length) {
      menuContainer.appendChild(cardMenu);
      this.addTagsToMenu(oracleEntries, cardMenu);
    }

    if (menuContainer.children.length === 0) {
      menuContainer.innerText = "No tags found. Add some!";
    }

    tooltip.style.top = `-${Math.floor(tooltip.offsetHeight / 3.75)}px`;
  }

  collectTags(payload: TaggerPayload): RelationshipCollection {
    const tags: RelationshipCollection = {
      art: [],
      oracle: [],
      print: [],
    };
    const tagToCollectionMap: Record<string, string> = {
      ILLUSTRATION_TAG: "art",
      ORACLE_CARD_TAG: "oracle",
      PRINTING_TAG: "print",
    };

    payload.taggings?.forEach((t) => {
      const type = t.tag.type;
      const key = tagToCollectionMap[type];
      const tagsByType = tags[key];
      const symbol = TAG_SYMBOLS[type];

      if (tagsByType) {
        tagsByType.push({
          symbol,
          isTag: true,
          name: t.tag.name,
        });
      }
    });

    return tags;
  }

  collectRelationships(payload: TaggerPayload): RelationshipCollection {
    const relationships: RelationshipCollection = {
      art: [],
      oracle: [],
    };
    const typeToRelationshipMap: Record<string, string> = {
      illustrationId: "art",
      oracleId: "oracle",
    };

    payload.relationships?.forEach((r) => {
      let name, type;
      let liClass = "";
      const isTheRelatedTag = payload[r.foreignKey] === r.relatedId;
      if (isTheRelatedTag) {
        name = r.contentName;
        type = r.classifier;
      } else {
        name = r.relatedName;
        type = r.classifierInverse;
      }

      const symbol = RELATIONSHIP_SYMBOLS[type] || "";

      if (type in SYMBOLS_THAT_MUST_BE_FLIPPED) {
        liClass = "icon-upside-down";
      } else if (type in SYMBOLS_THAT_MUST_BE_REVERSED) {
        liClass = "icon-flipped";
      }

      const relationshipsFromType =
        relationships[typeToRelationshipMap[r.foreignKey]];

      if (relationshipsFromType) {
        relationshipsFromType.push({
          name,
          symbol,
          liClass,
        });
      }
    });

    return relationships;
  }

  addTagsToMenu(
    tags: ShamblesharkRelationship[],
    menu: HTMLUListElement
  ): void {
    tags.sort(sortByAttribute(["isTag", "name"]));

    tags.forEach((tag) => {
      if (menu.children.length > 8) {
        return;
      }

      if (menu.children.length === 8) {
        menu.appendChild(createElement(`<li>+ ${tags.length - 7} more</li>`));

        return;
      }

      const li = createElement(`<li>
        ${tag.symbol} ${tag.name}
        </li>`);

      if (tag.liClass) {
        li.classList.add(tag.liClass);
      }
      menu.appendChild(li);
    });
  }
}

export default TaggerLink;
