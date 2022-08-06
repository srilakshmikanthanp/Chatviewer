// Copyright (c) 2022 Sri Lakshmi Kanthan P
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { IViewchatState } from "../interfaces/pagestates";
import { IMsg } from "../interfaces";

/**
 * This function is used to create a new IViewerState object.
 *
 * @param messages - messages to be displayed
 * @return - returns a viewer state
 */
export function createViewerState(
  chatId: number | null,
  messages: IMsg[],
): IViewchatState {
  return {
    header: { chatId },
    body: { messages }
  };
}
