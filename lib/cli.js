// Parse input arguments and execute convertor

'use strict';


const argparse    = require('argparse');
const fs          = require('fs');
const mkdirp      = require('mkdirp');
const path        = require('path');
const convert     = require('./convert');
const parse_range = require('./range_parse');
const canvas      = require('canvas');


function createCanvas(w, h) {
  return canvas.createCanvas(w, h);
}


class ActionFontAdd extends argparse.Action {
  call(parser, namespace, value) {
    let items = (namespace[this.dest] || []).slice();
    items.push({ source_path: value, ranges: [] });
    namespace[this.dest] = items;
  }
}


// add range or symbols to font;
// need to merge them into one array here so overrides work correctly
class ActionFontRangeAdd extends argparse.Action {
  call(parser, namespace, value) {
    let fonts = namespace.font || [];

    if (fonts.length === 0) {
      parser.error(`argument "${this.getName()}": Only allowed after --font`);
    }

    let lastFont = fonts[fonts.length - 1];

    // { symbols: 'ABC' }, or { range: [ 65, 67, 65 ] }
    lastFont.ranges.push({ [this.dest]: value });
  }
}


// Formatter with support of `\n` in Help texts.
class RawTextHelpFormatter2 extends argparse.RawDescriptionHelpFormatter {
  // copy of original RawTextHelpFormatter method with 2 lines commented
  _splitLines(text, width) {
    let lines = [];
    let delimiters = [ ' ', '.', ',', '!', '?' ];
    let re = new RegExp(`[${delimiters.join('')}][^${delimiters.join('')}]*$`);

    //text = text.replace(/[\n|\t]/g, ' ');

    text = text.trim();
    //text = text.replace(this._whitespaceMatcher, ' ');

    // Wraps the single paragraph in text (a string) so every line
    // is at most width characters long.
    text.split(argparse.Const.EOL).forEach(function (line) {
      if (width >= line.length) {
        lines.push(line);
        return;
      }

      let wrapStart = 0;
      let wrapEnd = width;
      let delimiterIndex = 0;
      while (wrapEnd <= line.length) {
        if (wrapEnd !== line.length && delimiters.indexOf(line[wrapEnd] < -1)) {
          delimiterIndex = (re.exec(line.substring(wrapStart, wrapEnd)) || {}).index;
          wrapEnd = wrapStart + delimiterIndex + 1;
        }
        lines.push(line.substring(wrapStart, wrapEnd));
        wrapStart = wrapEnd;
        wrapEnd += width;
      }
      if (wrapStart < line.length) {
        lines.push(line.substring(wrapStart, wrapEnd));
      }
    });

    return lines;
  }
}

// exclude negative numbers and non-numbers
function int(str) {
  if (!/^\d+$/.test(str)) throw new Error(`${str} is not a valid number`);

  let n = parseInt(str, 10);

  if (n <= 0) throw new Error(`${str} is not a valid number`);

  return n;
}


// wrap range parser into function to show error text correctly (it uses function name)
function range(str) {
  return parse_range(str);
}


module.exports.run = function (argv, debug = false) {

  //
  // Configure CLI
  //

  let parser = new argparse.ArgumentParser({
    version: '0.0.1',
    addHelp: true,
    formatterClass: RawTextHelpFormatter2,
    debug
  });

  parser.addArgument(
    [ '--size' ],
    {
      help: 'Output font size, pixels.',
      metavar: 'PIXELS',
      type: int,
      required: true
    }
  );

  parser.addArgument(
    [ '-o', '--output' ],
    {
      help: 'Output path.',
      metavar: '<path>'
    }
  );

  parser.addArgument(
    [ '--bpp' ],
    {
      help: 'Bits per pixel, for antialiasing.',
      choices: [ 1, 2, 4, 8 ],
      type: int,
      required: true
    }
  );

  /*parser.addArgument(
    [ '-c', '--compress' ],
    { help: 'compression algorithm' }
  );*/

  parser.addArgument(
    [ '--format' ],
    {
      help: 'Output format.',
      choices: convert.formats,
      defaultValue: convert.formats[0]
    }
  );

  parser.addArgument(
    [ '--font' ],
    {
      help: 'Source font path. Can be used multiple times to merge glyphs from different fonts.',
      metavar: '<path>',
      action: ActionFontAdd,
      required: true
    }
  );

  parser.addArgument(
    [ '-r', '--range' ],
    {
      help: `
Range of glyphs to copy. Can be used multiple times, belongs to previously declared "--font". Examples:
  -r 0x1F450
  -r 0x20-0x7F
  -r 32-127
  -r 0x1F450=>0xF005
  -r 0x1F450-0x1F470=>0xF005
`,
      type: range,
      action: ActionFontRangeAdd
    }
  );

  parser.addArgument(
    [ '--symbols' ],
    {
      help: `
List of characters to copy, belongs to previously declared "--font". Examples:
  --symbols ,.0123456789
  --symbols abcdefghigklmnopqrstuvwxyz
`,
      action: ActionFontRangeAdd
    }
  );

  //
  // Process CLI options
  //

  let args = parser.parseArgs(argv.length ? argv : [ '-h' ]);

  for (let { source, ranges } of args.font) {
    if (ranges.length === 0) {
      parser.error(`You need to specify either "--range" or "--symbols" for font "${source}"`);
    }
  }

  //
  // Convert
  //

  let files = convert(args, createCanvas);

  //
  // Store files
  //

  for (let [ filename, data ] of Object.entries(files)) {
    let dir = path.dirname(filename);

    mkdirp.sync(dir);

    fs.writeFileSync(filename, data);
  }

};