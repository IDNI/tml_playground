const term = {
	'variable': /\?[a-zA-Z][a-zA-Z0-9]*/,
	'char': /'.'/,
	'number': /\d+/,
	'punctuation': /[\.,]/,
	'parens': /[()]/,
	'null': /\bnull\b/,
	'comment': {
		pattern: /#.*/,
		greedy: true
	}
};
const tml = {
	'comment': {
		pattern: /#.*/,
		greedy: true
	},
	'directive': /\@[a-zA-Z][a-zA-Z0-9]+/,
	'string': {
		pattern: /(?:"[^"]*"|<[^>]*>)/, // "
		greedy: true
	},
	'rule': {
		pattern: /[\s\?'a-zA-Z0-9~\(\)#]+\s*\:\-\s*[\s\?'a-zA-Z0-9~\(\),#]+\./,
		greedy: true,
		inside: {
			'head-part': {
				pattern: /(?:#.*|\s+)*~?(?:#.*|\s+)*[\?'a-zA-Z0-9\(\)]+[\s\?'a-zA-Z0-9\(\)#]+\s*\:\-/,
				inside: {
					'nhead': {
						pattern: /(?:#.*|\s+)*\s*~\s*(?:#.*)*\s*[\s\?'a-zA-Z0-9\(\)#]+/,
						greedy: true,
						inside: term
					},
					'head':  {
						pattern: /(?:#.*|\s+)*[\?'a-zA-Z0-9\(\)]+[\s\?'a-zA-Z0-9\(\)#]*/,
						greedy: true,
						inside: term
					},
					'punctuation': /\:\-/,
					'comment': {
						pattern: /#.*/,
						greedy: true
					},
				}
			},
			'body': {
				pattern: /[\s\?'"a-zA-Z0-9~\(\),#]+\./,
				inside: term
			}
		}
	},
	'fact': {
		pattern: /[\s\?'"a-zA-Z0-9~\(\)#]+\./,
		inside: term
	},
	'punctuation': /[{}]/
};
module.exports = tml;
