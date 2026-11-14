import * as React from "react";
import * as ReactDom from "react-dom";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import OrderingApp from "./components/OrderingApp";
import { createSharePointRepository } from "../../services/readOnly";
import type { SharePointRepository } from "../../services/adapter/repository";

export default class OrderingWebPart extends BaseClientSideWebPart<
  Record<string, never>
> {
  private repository?: SharePointRepository;
  private connectionError?: string;
  // Controlled DEV test gate. This is deliberately code-only: no URL or property-pane switch.
  // Set to false immediately after the create-request test is complete.
  private static readonly enableNewRequestWriteTest = true;
  private static readonly enableDecisionWriteTest = true;
  protected async onInit(): Promise<void> {
    await super.onInit();
    try {
      this.repository = createSharePointRepository(
        this.context,
        OrderingWebPart.enableNewRequestWriteTest ||
          OrderingWebPart.enableDecisionWriteTest,
      );
    } catch (error) {
      this.connectionError =
        error instanceof Error ? error.message : String(error);
    }
  }
  public render(): void {
    ReactDom.render(
      React.createElement(OrderingApp, {
        repository: this.repository,
        contextUser: this.context.pageContext.user.displayName,
        connectionError: this.connectionError,
        newRequestWriteTestEnabled:
          OrderingWebPart.enableNewRequestWriteTest,
        decisionWriteTestEnabled: OrderingWebPart.enableDecisionWriteTest,
      }),
      this.domElement,
    );
  }
  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }
}
