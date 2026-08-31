import { setIcon } from "obsidian";

export type DropPlacement = "before" | "after";

interface DragIdentity {
  kind: string;
  scope: string;
  id: string;
}

interface DragHandleOptions extends DragIdentity {
  label: string;
  onMove: (
    sourceId: string,
    targetId: string,
    placement: DropPlacement,
  ) => void | Promise<void>;
}

export class OrderDragController {
  private dragging: DragIdentity | null = null;
  private containerEl: HTMLElement | null = null;

  setContainer(container: HTMLElement): void {
    this.containerEl = container;
  }

  attach(
    header: HTMLElement,
    wrap: HTMLElement,
    options: DragHandleOptions,
  ): void {
    const handle = header.createDiv({
      cls: "gpe-drag-handle",
      attr: { draggable: "true", "aria-label": options.label },
    });
    setIcon(handle, "grip-vertical");
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("contextmenu", (event) => event.stopPropagation());
    handle.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      this.dragging = {
        kind: options.kind,
        scope: options.scope,
        id: options.id,
      };
      wrap.addClass("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "text/plain",
          `${options.kind}:${options.scope}:${options.id}`,
        );
      }
    });
    handle.addEventListener("dragend", () => this.reset());
    header.addEventListener("dragover", (event) => {
      if (!this.canDrop(options)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.showIndicator(wrap, this.getPlacement(event, header));
    });
    header.addEventListener("drop", (event) => {
      if (!this.canDrop(options) || !this.dragging) return;
      event.preventDefault();
      const sourceId = this.dragging.id;
      const placement = this.getPlacement(event, header);
      this.reset();
      void options.onMove(sourceId, options.id, placement);
    });
  }

  reset(): void {
    this.dragging = null;
    this.containerEl
      ?.querySelectorAll(".is-drop-before, .is-drop-after, .is-dragging")
      .forEach((element) =>
        element.removeClass("is-drop-before", "is-drop-after", "is-dragging"),
      );
  }

  private canDrop(target: DragIdentity): boolean {
    return Boolean(
      this.dragging &&
        this.dragging.kind === target.kind &&
        this.dragging.scope === target.scope &&
        this.dragging.id !== target.id,
    );
  }

  private getPlacement(event: DragEvent, target: HTMLElement): DropPlacement {
    const bounds = target.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  private showIndicator(element: HTMLElement, placement: DropPlacement): void {
    this.resetIndicators();
    element.addClass(placement === "before" ? "is-drop-before" : "is-drop-after");
  }

  private resetIndicators(): void {
    this.containerEl
      ?.querySelectorAll(".is-drop-before, .is-drop-after")
      .forEach((element) => element.removeClass("is-drop-before", "is-drop-after"));
  }
}
