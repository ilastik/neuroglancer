/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export function removeChildren(element: HTMLElement) {
  while (true) {
    let child = element.firstElementChild;
    if (!child) {
      break;
    }
    element.removeChild(child);
  }
}

export function removeFromParent(element: HTMLElement) {
  let {parentElement} = element;
  if (parentElement) {
    parentElement.removeChild(element);
    return true;
  }
  return false;
}

export function createElement({tagName, parentElement, innerHTML, cssClasses, click}:
    {tagName:string, parentElement:HTMLElement, innerHTML?:string, cssClasses?:Array<string>, click?(event: any): void}
): HTMLElement{
    const element = document.createElement(tagName);
    parentElement.appendChild(element)
    if(innerHTML !== undefined){
        element.innerHTML = innerHTML
    }
    (cssClasses || []).forEach(klass => {
        element.classList.add(klass)
    })
    if(click !== undefined){
        element.addEventListener('click', click)
    }
    return element
}

export function createInput({inputType, parentElement, value, name, disabled=false, click} :
    {inputType: string, parentElement:HTMLElement, value?:string, name?:string, disabled?:boolean, click?(event: any): void}
): HTMLInputElement{
    const input = <HTMLInputElement>createElement({tagName:'input', parentElement, click})
    input.type = inputType;
    if(value !== undefined){
        input.value = value
    }
    if(name !== undefined){
        input.name = name
    }
    input.disabled = disabled
    return input
}


