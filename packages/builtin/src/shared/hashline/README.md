# Hashline text core

Line hashing and batch text editing adapted from @d3ara1n/pi-hashline-edit, version 0.7.1, under the MIT license. The adaptation preserves hashing, batch validation, moved-line candidates, range checks, and per-line endings. A final standalone carriage return remains content.

Hashes combine line number and complete text. They are short comparison aids, not resource identity or authorization. A batch validates against one current text value and either applies together or fails without partial edits.

Range endpoints protect their referenced lines, not every interior line. Moved-line candidates support an explicit retry rather than automatic relocation. Append and prepend need no anchors.

The pure core does not access files or storage. The backend owns resource access, persistence, and result presentation.

Upstream source attribution: [pi-hashline-edit](https://github.com/d3ara1n/pi-extensions/tree/77d1fdfac95eeb3bb8bf0b4383af2d4af0d2655a/packages/pi-hashline-edit/src/core).

The upstream MIT license follows:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
