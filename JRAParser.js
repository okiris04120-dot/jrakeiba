/*

 * JRA iPhone Copy Parser

 * JRAParser.js

 * Version 2.0.0

 *

 * iPhone SafariでJRAの出馬表・馬柱をコピーして

 * そのまま貼り付けることを想定したパーサー。

 *

 * parser only:

 * 予想・点数計算・勝率計算は行わない。

 */

(function (global) {

  'use strict';

  const VERSION = '2.0.0';

  const SPECIAL_STATUS = [

    '取消',

    '中止',

    '除外',

    '失格'

  ];

  const STATUS_RE = /取消|中止|除外|失格/;

  const DATE_RE =

    /(20\d{2})[./\-年](\d{1,2})[./\-月](\d{1,2})日?/;

  const DATE_RE_SHORT =

    /(\d{1,2})[./](\d{1,2})/;

  const SEX_RE = /([牡牝セ騸])\s*([0-9０-９]{1,2})/;

  const WEIGHT_RE =

    /(?:斤量|負担重量)?\s*([0-9０-９]{2}(?:\.[0-9０-９]+)?)/;

  const HORSE_WEIGHT_RE =

    /([0-9０-９]{3})\s*(?:\(([+\-＋－]?[0-9０-９]+)\))?/;

  const TIME_RE =

    /(?:1:)?([0-9０-９]{1,2}):([0-9０-９]{2})(?:\.([0-9０-９]))?/;

  const LAST3F_RE =

    /(?:上がり|上り|3F|３F)\s*([0-9０-９]{2}\.[0-9０-９])/i;

  const DISTANCE_RE =

    /(?:芝|ダート|ダ|障害|障)\s*([0-9０-９]{3,4})m?/;

  const FIELD_RE =

    /([0-9０-９]{1,2})\s*頭/;

  const HORSE_NUMBER_RE =

    /(?:^|\s)([1-9０-９]|1[0-8０-８])(?:\s|$)/;

  const POPULARITY_RE =

    /([1-9０-９]|1[0-8０-８])\s*番人気/;

  const PASSING_RE =

    /(?:通過|位置取り)?\s*([0-9０-９]+(?:[,-][0-9０-９]+){1,3})/;

  const MARGIN_RE =

    /(?:ハナ|クビ|アタマ|大差|半馬身|[0-9０-９]+馬身|[0-9０-９]+\.[0-9０-９]+秒差)/;

  const SURFACE_RE = /(芝|ダート|ダ|障害|障)/;

  const CONDITION_RE =

    /(良|稍重|重|不良)/;

  const TRACK_NAMES = [

    '札幌',

    '函館',

    '福島',

    '新潟',

    '東京',

    '中山',

    '中京',

    '京都',

    '阪神',

    '小倉'

  ];

  function normalizeText(raw) {

    return String(raw || '')

      .replace(/\r\n/g, '\n')

      .replace(/\r/g, '\n')

      .replace(/\u00a0/g, ' ')

      .replace(/\u3000/g, ' ')

      .replace(/[０-９]/g, function (c) {

        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);

      })

      .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) {

        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);

      })

      .replace(/[\t ]+/g, ' ')

      .replace(/\n[ \t]+/g, '\n')

      .replace(/[ \t]+\n/g, '\n')

      .trim();

  }

  function clean(s) {

    return String(s == null ? '' : s)

      .replace(/\u3000/g, ' ')

      .replace(/[ \t]+/g, ' ')

      .trim();

  }

  function num(s) {

    if (s == null || s === '') return null;

    const n = Number(

      String(s)

        .replace(/[０-９]/g, function (c) {

          return String.fromCharCode(c.charCodeAt(0) - 0xfee0);

        })

        .replace(/[^0-9.\-+]/g, '')

    );

    return Number.isFinite(n) ? n : null;

  }

  function unique(arr) {

    return Array.from(new Set(arr));

  }

  function parseDate(text) {

    const s = clean(text);

    let m = s.match(DATE_RE);

    if (m) {

      return (

        m[1] +

        '-' +

        String(m[2]).padStart(2, '0') +

        '-' +

        String(m[3]).padStart(2, '0')

      );

    }

    return null;

  }

  function findDates(text) {

    const result = [];

    const re = new RegExp(DATE_RE.source, 'g');

    let m;

    while ((m = re.exec(text))) {

      result.push({

        index: m.index,

        date:

          m[1] +

          '-' +

          String(m[2]).padStart(2, '0') +

          '-' +

          String(m[3]).padStart(2, '0')

      });

    }

    return result;

  }

  function getLines(text) {

    return normalizeText(text)

      .split('\n')

      .map(clean)

      .filter(Boolean);

  }

  function looksLikeHorseName(text) {

    const s = clean(text);

    if (!s) return false;

    if (s.length < 2 || s.length > 30) return false;

    if (DATE_RE.test(s)) return false;

    if (STATUS_RE.test(s)) return false;

    if (/^\d+$/.test(s)) return false;

    if (/^[\d\s./:+\-]+$/.test(s)) return false;

    /*

     * JRAの馬名は日本語・英数字・記号を含み得る。

     * 明らかな見出しだけ除外する。

     */

    const bad = [

      '馬名',

      '性齢',

      '斤量',

      '騎手',

      '調教師',

      '馬体重',

      '人気',

      '着順',

      '前走',

      '前々走',

      '3走前',

      '4走前',

      '単勝',

      'オッズ',

      '枠番',

      '馬番',

      'レース'

    ];

    if (bad.indexOf(s) >= 0) return false;

    return /[一-龯ぁ-んァ-ヶA-Za-z]/.test(s);

  }

  function parseSexAge(text) {

    const m = clean(text).match(SEX_RE);

    if (!m) {

      return {

        sex: null,

        age: null

      };

    }

    return {

      sex: m[1],

      age: num(m[2])

    };

  }

  function extractJockey(text) {

    const s = clean(text);

    const labels = [

      '騎手',

      '騎手名'

    ];

    for (const label of labels) {

      const i = s.indexOf(label);

      if (i >= 0) {

        const value = clean(

          s.slice(i + label.length)

        );

        if (value) {

          return value;

        }

      }

    }

    return null;

  }

  function extractTrainer(text) {

    const s = clean(text);

    const i = s.indexOf('調教師');

    if (i >= 0) {

      const value = clean(

        s.slice(i + 3)

      );

      return value || null;

    }

    return null;

  }

  function extractCurrentHorseNumber(lines, index) {

    /*

     * 現在の出走馬番号を検出。

     *

     * 「16頭 5番人気」など過去走の数字を

     * 馬番と誤認しないよう、周辺情報を確認する。

     */

    for (

      let i = index;

      i < Math.min(lines.length, index + 4);

      i++

    ) {

      const s = lines[i];

      let m = s.match(

        /(?:^|\s)(1[0-8]|[1-9])(?:\s|$)/

      );

      if (!m) {

        m = s.match(

          /(?:^|\s)(1[0-8]|[1-9])番/

        );

      }

      if (m) {

        const n = Number(m[1]);

        if (n >= 1 && n <= 18) {

          return n;

        }

      }

    }

    return null;

  }

  function findHorseBlocks(lines) {

    const candidates = [];

    for (let i = 0; i < lines.length; i++) {

      const s = lines[i];

      let number = null;

      let m = s.match(

        /^(1[0-8]|[1-9])(?:\s+|番\s*)/

      );

      if (m) {

        number = Number(m[1]);

      }

      if (number == null) continue;

      /*

       * 直後数行から馬名候補を探す。

       */

      let nameIndex = -1;

      for (

        let j = i;

        j < Math.min(lines.length, i + 5);

        j++

      ) {

        if (looksLikeHorseName(lines[j])) {

          nameIndex = j;

          break;

        }

      }

      if (nameIndex < 0) continue;

      let score = 30;

      score += 30;

      const around = lines

        .slice(i, Math.min(lines.length, i + 8))

        .join(' ');

      if (SEX_RE.test(around)) {

        score += 15;

      }

      if (

        /(?:騎手|斤量)/.test(around)

      ) {

        score += 15;

      }

      if (

        /(?:調教師|馬体重)/.test(around)

      ) {

        score += 10;

      }

      candidates.push({

        start: i,

        nameIndex,

        horseNumber: number,

        score

      });

    }

    /*

     * 同じ馬番の候補が複数ある場合、

     * 信頼度の高い候補を残す。

     */

    const best = {};

    candidates.forEach(function (c) {

      const key = String(c.horseNumber);

      if (

        !best[key] ||

        c.score > best[key].score

      ) {

        best[key] = c;

      }

    });

    return Object.values(best)

      .sort(function (a, b) {

        return a.start - b.start;

      });

  }

  function parseSpecialStatus(text) {

    const s = clean(text);

    for (const status of SPECIAL_STATUS) {

      if (s.indexOf(status) >= 0) {

        return status;

      }

    }

    return null;

  }

  function parseFinish(text) {

    const s = clean(text);

    const special = parseSpecialStatus(s);

    if (special) {

      return {

        value: null,

        status: special

      };

    }

    const m = s.match(

      /(?:^|\s)([1-9]|1[0-8])(?:着|\s|$)/

    );

    if (m) {

      return {

        value: Number(m[1]),

        status: 'FINISHED'

      };

    }

    return {

      value: null,

      status: null

    };

  }

  function parseFieldAndPopularity(text) {

    const s = clean(text);

    let fieldSize = null;

    let popularity = null;

    let horseNumber = null;

    const fm = s.match(FIELD_RE);

    if (fm) {

      fieldSize = num(fm[1]);

    }

    const pm = s.match(POPULARITY_RE);

    if (pm) {

      popularity = num(pm[1]);

    }

    const hm = s.match(

      /([1-9]|1[0-8])\s*番/

    );

    if (hm) {

      horseNumber = num(hm[1]);

    }

    return {

      fieldSize,

      popularity,

      horseNumber

    };

  }

  function parseSurfaceDistance(text) {

    const s = clean(text);

    const m = s.match(DISTANCE_RE);

    if (!m) {

      return {

        surface: null,

        distance: null

      };

    }

    let surface = m[0]

      .replace(/[0-9m０-９]/g, '')

      .trim();

    if (surface === 'ダ') {

      surface = 'ダート';

    }

    if (surface === '障') {

      surface = '障害';

    }

    return {

      surface: surface || null,

      distance: num(m[1])

    };

  }

  function parseTime(text) {

    const s = clean(text);

    const m = s.match(

      /([0-9]{1,2}):([0-9]{2})(?:\.([0-9]))?/

    );

    if (!m) return null;

    const minutes = Number(m[1]);

    const seconds = Number(m[2]);

    const tenth =

      m[3] ? Number(m[3]) / 10 : 0;

    return {

      display: m[0],

      seconds:

        minutes * 60 +

        seconds +

        tenth

    };

  }

  function parseHorseWeight(text) {

    const s = clean(text);

    const m = s.match(

      /([0-9]{3})\s*(?:\(([+\-][0-9]+)\))?/

    );

    if (!m) {

      return {

        weight: null,

        change: null

      };

    }

    return {

      weight: num(m[1]),

      change:

        m[2] != null ? num(m[2]) : null

    };

  }

  function parseLast3F(text) {

    const s = clean(text);

    const m = s.match(

      /(?:上がり|上り|3F|３F)[^\d]*([0-9]{2}\.[0-9])/i

    );

    if (!m) {

      const fallback =

        s.match(/([0-9]{2}\.[0-9])$/);

      if (fallback) {

        const n = num(fallback[1]);

        if (n >= 30 && n <= 45) {

          return n;

        }

      }

      return null;

    }

    return num(m[1]);

  }

  function parsePassingOrder(text) {

    const s = clean(text);

    const patterns = [

      /([0-9]+[,\-][0-9]+(?:[,\-][0-9]+){0,2})/,

      /([0-9]+(?:,[0-9]+){1,3})/

    ];

    for (const re of patterns) {

      const m = s.match(re);

      if (m) {

        return m[1]

          .split(/[,\-]/)

          .map(Number)

          .filter(function (n) {

            return Number.isFinite(n);

          });

      }

    }

    return null;

  }

  function findTrack(text) {

    const s = clean(text);

    for (const track of TRACK_NAMES) {

      if (s.indexOf(track) >= 0) {

        return track;

      }

    }

    return null;

  }

  function parseRaceName(text) {

    const s = clean(text);

    /*

     * 余計な数値だけの行を除外。

     */

    if (

      !s ||

      /^\d+$/.test(s) ||

      DATE_RE.test(s)

    ) {

      return null;

    }

    if (

      /(?:芝|ダート|障害)\s*\d{3,4}m/.test(s)

    ) {

      return null;

    }

    if (

      /^(?:良|稍重|重|不良)$/.test(s)

    ) {

      return null;

    }

    if (

      /^(?:前走|前々走|3走前|4走前)$/.test(s)

    ) {

      return null;

    }

    if (

      s.length >= 2 &&

      s.length <= 40 &&

      /[一-龯ぁ-んァ-ヶ]/.test(s)

    ) {

      return s;

    }

    return null;

  }

  function collectRaceChunks(block) {

    const dates = [];

    block.forEach(function (line, index) {

      const parsed = parseDate(line);

      if (parsed) {

        dates.push({

          index,

          date: parsed

        });

      }

    });

    const chunks = [];

    for (let i = 0; i < dates.length; i++) {

      const start = dates[i].index;

      const end =

        i + 1 < dates.length

          ? dates[i + 1].index

          : block.length;

      chunks.push({

        date: dates[i].date,

        start,

        end,

        lines: block.slice(start, end)

      });

    }

    return chunks;

  }

  function parseRecentRace(chunk, slot) {

    const lines = chunk.lines;

    const text = lines.join(' ');

    const warnings = [];

    const finishInfo =

      parseFinish(text);

    const fieldInfo =

      parseFieldAndPopularity(text);

    const sd =

      parseSurfaceDistance(text);

    const time =

      parseTime(text);

    const horseWeight =

      parseHorseWeight(text);

    const last3f =

      parseLast3F(text);

    const passing =

      parsePassingOrder(text);

    const track =

      findTrack(text);

    const conditionMatch =

      text.match(CONDITION_RE);

    const condition =

      conditionMatch

        ? conditionMatch[1]

        : null;

    const special =

      finishInfo.status !== 'FINISHED'

        ? finishInfo.status

        : null;

    let raceName = null;

    for (let i = 1; i < lines.length; i++) {

      const candidate =

        parseRaceName(lines[i]);

      if (candidate) {

        raceName = candidate;

        break;

      }

    }

    if (!finishInfo.value && !special) {

      warnings.push(

        '着順を確認できませんでした'

      );

    }

    if (!sd.distance) {

      warnings.push(

        '距離を確認できませんでした'

      );

    }

    if (!time) {

      warnings.push(

        '走破タイムを確認できませんでした'

      );

    }

    const fieldCount =

      [

        finishInfo.value != null || special,

        sd.distance != null,

        sd.surface != null,

        time != null,

        last3f != null,

        passing != null

      ].filter(Boolean).length;

    let confidence = 'LOW';

    if (fieldCount >= 5) {

      confidence = 'HIGH';

    } else if (fieldCount >= 3) {

      confidence = 'MEDIUM';

    }

    return {

      slot,

      date: chunk.date,

      track,

      raceName,

      finish: finishInfo.value,

      status:

        special || 'FINISHED',

      fieldSize:

        fieldInfo.fieldSize,

      horseNumber:

        fieldInfo.horseNumber,

      popularity:

        fieldInfo.popularity,

      jockey:

        extractJockey(text),

      carriedWeight:

        null,

      horseWeight:

        horseWeight.weight,

      horseWeightChange:

        horseWeight.change,

      distance:

        sd.distance,

      surface:

        sd.surface,

      trackCondition:

        condition,

      time:

        time,

      passingOrder:

        passing,

      last3F:

        last3f,

      margin:

        MARGIN_RE.test(text)

          ? (

              text.match(MARGIN_RE) || []

            )[0]

          : null,

      warnings,

      missing: {

        track: track == null,

        raceName: raceName == null,

        finish:

          finishInfo.value == null &&

          !special,

        fieldSize:

          fieldInfo.fieldSize == null,

        horseNumber:

          fieldInfo.horseNumber == null,

        popularity:

          fieldInfo.popularity == null,

        jockey:

          extractJockey(text) == null,

        carriedWeight: true,

        horseWeight:

          horseWeight.weight == null,

        distance:

          sd.distance == null,

        surface:

          sd.surface == null,

        trackCondition:

          condition == null,

        time:

          time == null,

        passingOrder:

          passing == null,

        last3F:

          last3f == null

      },

      confidence,

      source: 'JRA_COPY',

      rawText:

        lines.join('\n')

    };

  }

  function parseHorseBlock(lines, blockInfo) {

    const start =

      blockInfo.start;

    const end =

      blockInfo.end;

    const block =

      lines.slice(start, end);

    const horseNumber =

      blockInfo.horseNumber;

    const nameIndex =

      blockInfo.nameIndex - start;

    const horseName =

      block[nameIndex] || null;

    const currentText =

      block

        .slice(

          0,

          Math.min(

            block.length,

            nameIndex + 5

          )

        )

        .join(' ');

    const sexAge =

      parseSexAge(currentText);

    const weightMatch =

      currentText.match(

        /斤量\s*([0-9]+(?:\.[0-9]+)?)/ 

      );

    const weight =

      weightMatch

        ? num(weightMatch[1])

        : null;

    const jockey =

      extractJockey(currentText);

    const trainer =

      extractTrainer(currentText);

    const raceChunks =

      collectRaceChunks(block);

    const recentRaces = [];

    raceChunks

      .slice(0, 4)

      .forEach(function (chunk, index) {

        recentRaces.push(

          parseRecentRace(

            chunk,

            index + 1

          )

        );

      });

    /*

     * 4走に満たない場合も

     * slotを固定してnullで埋める。

     */

    while (recentRaces.length < 4) {

      recentRaces.push(null);

    }

    const validRuns =

      recentRaces.filter(function (r) {

        return (

          r &&

          (

            r.status === 'FINISHED' ||

            r.finish != null

          )

        );

      }).length;

    const specialRuns =

      recentRaces.filter(function (r) {

        return (

          r &&

          SPECIAL_STATUS.indexOf(r.status) >= 0

        );

      }).length;

    const warningList = [];

    if (!horseName) {

      warningList.push(

        '馬名を取得できませんでした'

      );

    }

    if (recentRaces.filter(Boolean).length < 4) {

      warningList.push(

        '前4走を4走分取得できませんでした'

      );

    }

    if (validRuns === 0) {

      warningList.push(

        '有効な過去走がありません'

      );

    }

    let confidence =

      blockInfo.score >= 80

        ? 'HIGH'

        : blockInfo.score >= 60

          ? 'MEDIUM'

          : 'LOW';

    if (

      horseName &&

      validRuns >= 3

    ) {

      confidence =

        confidence === 'LOW'

          ? 'MEDIUM'

          : confidence;

    }

    return {

      frame: null,

      horseNumber,

      horseName,

      sex: sexAge.sex,

      age: sexAge.age,

      coatColor: null,

      currentWeight: null,

      carriedWeight: weight,

      jockey,

      trainer,

      recentRaces,

      validRunCount: validRuns,

      specialRunCount: specialRuns,

      confidence,

      warnings: unique(warningList),

      errors: [],

      source: {

        type: 'JRA_COPY',

        rawBlock:

          block.join('\n')

      },

      manualOverrides: {},

      calculated: {}

    };

  }

  function detectHorseBlocks(lines) {

    const candidates =

      findHorseBlocks(lines);

    const blocks = [];

    for (let i = 0; i < candidates.length; i++) {

      const current =

        candidates[i];

      const next =

        candidates[i + 1];

      let end =

        next

          ? next.start

          : lines.length;

      /*

       * あまりに巨大なブロックは

       * 誤検出の可能性が高い。

       */

      if (

        end - current.start > 300

      ) {

        end =

          current.start + 300;

      }

      blocks.push({

        start: current.start,

        end,

        nameIndex:

          current.nameIndex,

        horseNumber:

          current.horseNumber,

        score:

          current.score

      });

    }

    return blocks;

  }

  function validateHorses(horses) {

    const warnings = [];

    const errors = [];

    const numbers =

      horses

        .map(function (h) {

          return h.horseNumber;

        })

        .filter(function (n) {

          return n != null;

        });

    const duplicateNumbers =

      unique(

        numbers.filter(function (n, i) {

          return numbers.indexOf(n) !== i;

        })

      );

    if (duplicateNumbers.length) {

      warnings.push(

        '馬番重複: ' +

        duplicateNumbers.join(', ')

      );

    }

    if (horses.length === 0) {

      errors.push(

        '出走馬を検出できませんでした'

      );

    }

    if (horses.length > 18) {

      warnings.push(

        '18頭を超える馬が検出されました。コピー範囲を確認してください'

      );

    }

    return {

      warnings,

      errors

    };

  }

  function calculateSummary(horses, warnings, errors) {

    const totalRuns =

      horses.reduce(function (sum, horse) {

        return (

          sum +

          horse.recentRaces.filter(Boolean).length

        );

      }, 0);

    const validRuns =

      horses.reduce(function (sum, horse) {

        return sum + horse.validRunCount;

      }, 0);

    const specialRuns =

      horses.reduce(function (sum, horse) {

        return sum + horse.specialRunCount;

      }, 0);

    const high =

      horses.filter(function (h) {

        return h.confidence === 'HIGH';

      }).length;

    const medium =

      horses.filter(function (h) {

        return h.confidence === 'MEDIUM';

      }).length;

    const low =

      horses.filter(function (h) {

        return h.confidence === 'LOW';

      }).length;

    let confidence = 'LOW';

    if (

      horses.length >= 1 &&

      high >= Math.ceil(horses.length * 0.7)

    ) {

      confidence = 'HIGH';

    } else if (

      horses.length >= 1 &&

      high + medium >=

        Math.ceil(horses.length * 0.6)

    ) {

      confidence = 'MEDIUM';

    }

    return {

      horseCount: horses.length,

      totalRunCount: totalRuns,

      validRunCount: validRuns,

      specialRunCount: specialRuns,

      expectedRunCount:

        horses.length * 4,

      errorCount:

        errors.length,

      warningCount:

        warnings.length,

      highConfidenceHorseCount:

        high,

      mediumConfidenceHorseCount:

        medium,

      lowConfidenceHorseCount:

        low,

      confidence,

      parseConfidence:

        confidence

    };

  }

  function parse(rawText, raceInfo) {

    const raw =

      String(rawText || '');

    const normalized =

      normalizeText(raw);

    const warnings = [];

    const errors = [];

    if (!normalized) {

      return {

        version: VERSION,

        ok: false,

        source: {

          type: 'JRA_COPY',

          rawText: raw,

          normalizedText: ''

        },

        raceInfo:

          raceInfo || {},

        horses: [],

        warnings: [],

        errors: [

          '入力データが空です'

        ],

        summary: {

          horseCount: 0,

          totalRunCount: 0,

          validRunCount: 0,

          specialRunCount: 0,

          expectedRunCount: 0,

          errorCount: 1,

          warningCount: 0,

          confidence: 'LOW',

          parseConfidence: 'LOW'

        }

      };

    }

    const lines =

      getLines(normalized);

    const blocks =

      detectHorseBlocks(lines);

    if (!blocks.length) {

      errors.push(

        '馬番・馬名を検出できませんでした'

      );

      return {

        version: VERSION,

        ok: false,

        source: {

          type: 'JRA_COPY',

          rawText: raw,

          normalizedText: normalized

        },

        raceInfo:

          raceInfo || {},

        horses: [],

        warnings,

        errors,

        summary: {

          horseCount: 0,

          totalRunCount: 0,

          validRunCount: 0,

          specialRunCount: 0,

          expectedRunCount: 0,

          errorCount: errors.length,

          warningCount: warnings.length,

          confidence: 'LOW',

          parseConfidence: 'LOW'

        }

      };

    }

    const horses =

      blocks.map(function (block) {

        return parseHorseBlock(

          lines,

          block

        );

      });

    const validation =

      validateHorses(horses);

    warnings.push.apply(

      warnings,

      validation.warnings

    );

    errors.push.apply(

      errors,

      validation.errors

    );

    /*

     * 馬単位の警告を全体にも反映。

     */

    horses.forEach(function (horse) {

      horse.warnings.forEach(function (w) {

        warnings.push(

          '馬番' +

          (horse.horseNumber || '?') +

          ': ' +

          w

        );

      });

    });

    const uniqueWarnings =

      unique(warnings);

    const summary =

      calculateSummary(

        horses,

        uniqueWarnings,

        errors

      );

    return {

      version: VERSION,

      ok:

        errors.length === 0,

      source: {

        type: 'JRA_COPY',

        rawText: raw,

        normalizedText: normalized,

        lineCount: lines.length

      },

      raceInfo:

        raceInfo || {},

      horses,

      warnings:

        uniqueWarnings,

      errors,

      summary,

      meta: {

        parser: 'JRAParser',

        version: VERSION,

        generatedAt:

          new Date().toISOString(),

        iphoneCopyCompatible: true,

        specialStatuses:

          SPECIAL_STATUS.slice(),

        fourRunSlots: [

          '前走',

          '2走前',

          '3走前',

          '4走前'

        ]

      }

    };

  }

  /*

   * 手動修正値を適用するための関数。

   * 元データは変更しない。

   */

  function applyManualOverride(

    parsed,

    horseNumber,

    field,

    value

  ) {

    if (

      !parsed ||

      !Array.isArray(parsed.horses)

    ) {

      return parsed;

    }

    const horse =

      parsed.horses.find(function (h) {

        return (

          h.horseNumber === horseNumber

        );

      });

    if (!horse) {

      return parsed;

    }

    horse.manualOverrides[field] =

      value;

    horse[field] = value;

    return parsed;

  }

  /*

   * 予想エンジン側で使いやすい

   * 正規化済みデータだけを返す。

   */

  function getUsableHorses(parsed) {

    if (

      !parsed ||

      !Array.isArray(parsed.horses)

    ) {

      return [];

    }

    return parsed.horses.filter(function (horse) {

      return (

        horse.horseNumber != null &&

        horse.horseName &&

        horse.confidence !== 'LOW'

      );

    });

  }

  const JRAParser = {

    VERSION,

    parse,

    normalizeText,

    detectHorseBlocks,

    applyManualOverride,

    getUsableHorses,

    SPECIAL_STATUS

  };

  global.JRAParser = JRAParser;

})(window);
