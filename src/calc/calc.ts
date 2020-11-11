import { Table } from '../table';
import { newComponent } from './component';
import { newRange, Range } from './range';
import { Grammars, IToken } from 'ebnf';
import { flatMap, isEqual } from 'lodash';

// TODO: Add unit test for table.setCellAt
// TODO: Add unit test for tablerow.setCellAt

/**
 * W3C grammar describing a valid formula at the bottom of a table.
 *
 * The library being used to parse the formula does not suport EBNF, only BNF,
 * so W3C syntax was used in order to get access to extended features.
 *
 * The parser generates a PEG parser, whic is not able to handle ambiguity. The
 * order of constructions is significant.
 * See https://github.com/lys-lang/node-ebnf/issues/34
 */
export const parserGrammar = `
tblfm_line ::= "<!-- TBLFM: " formula_list " -->"
formula_list ::= formula ( "::" formula_list )?
formula ::= destination "=" source display_directive?
destination ::=  range | component
source ::= range | component | single_param_function_call | conditional_function_call | algebraic_operation

range ::= row column ".." row column
component ::= row column | row | column
row ::= "@" ( real | relative_row )
column ::= "$" ( real | relative_column )
relative_row ::= ( "<" | ">" | "I" ) offset?
relative_column ::= ( "<" | ">" ) offset?
offset ::= ( "-" | "+" ) int

single_param_function_call ::= single_param_function "(" parameter ")"
single_param_function ::= "mean" | "sum" | "exp" | "tan" | "sin" | "cos" 
parameter ::= range | component

conditional_function_call ::= "if(" predicate ", " source ", " source ")"
predicate ::= source conditional_operator source
conditional_operator ::= ">" | "<" | ">=" | "<=" | "==" | "!="

algebraic_operation ::= algebraic_operand " "? algebraic_operator " "? algebraic_operand
algebraic_operator ::= "+" | "-" | "*" | "/"
algebraic_operand ::= component | single_param_function_call | conditional_function_call | ( "(" algebraic_operation ")" )

display_directive ::= ";" display_directive_option
display_directive_option ::= formatting_directive
formatting_directive ::= "%." int "f"

real ::= '-'? int
int ::= [0-9]+
`;

enum Operator {
  Plus = 'plus',
  Minus = 'minus',
}

enum Func {
  Mean = 'mean',
  Sum = 'sum',
  Exp = 'exp',
  Tan = 'tan',
  Sin = 'sin',
  Cos = 'cos',
}

export interface Arity {
  rows: number;
  cols: number;
}

export class Value {
  private readonly val: string[][];

  constructor(val: string[][]) {
    this.val = val;
  }

  public get(row: number, column: number): string {
    return this.val[row][column];
  }

  /**
   * getArity returns the dimensions of the contained value, in rows and columns
   */
  public getArity = (): Arity => {
    const maxCols = this.val.reduce<number>(
      (max: number, currentRow: string[]): number =>
        Math.max(max, currentRow.length),
      0,
    );
    return { rows: this.val.length, cols: maxCols };
  };
}

export interface ValueProvider {
  getValue(table: Table): Value;
}

export class Formula {
  private readonly source: Source;
  private readonly destination: Destination;

  constructor(ast: IToken, table: Table) {
    this.destination = new Destination(ast.children[0], table);
    this.source = new Source(ast.children[1], table);
  }

  public merge = (table: Table): Table => {
    // TODO: Change functions from vmean to mean, mode, min, etc.

    // Source needs to be evaluated from the inside, out
    // For example, @2$3=sum($4 * 2)

    // TODO: Grammar does not allow for the function above.

    // Recursively evaluate from the inside out.
    // Each action pulls data from the table, and stores in a local matrix.
    // Operations can be performed on the matrix as necessary,
    //   producing another matrix of the same dimensions, or a single value.
    // A parent operation consumes the two child matrices.
    //   Arity of the child matricies should be checked, and rejected if mismatched.
    // Repeat recursively up to the root.
    // The destination then compares the arity of the final source matrix.
    //   If one value, it can be assigned to a cell or range
    //   If a range, it can only be assigned to a range of matching dimensions.

    const value = this.source.getValue(table);

    const valueArity = value.getArity();
    const destArity = this.destination.getArity(table);
    if (!isEqual(valueArity, destArity)) {
      throw Error('Source and destination arity mismatch');
    }

    return this.destination.merge(table, value);
  };
}

class Source {
  private readonly locationDescriptor: ValueProvider;

  constructor(ast: IToken, table: Table) {
    if (ast.type !== 'source') {
      throw Error('Invalid AST token type of ' + ast.type);
    }
    if (ast.children.length !== 1) {
      throw Error('Unexpected children length in Source');
    }

    const paramChild = ast.children[0];
    this.locationDescriptor = newValueProvider(paramChild, table);
  }

  public getValue = (table: Table): Value =>
    this.locationDescriptor.getValue(table);
}

class Destination {
  private readonly locationDescriptor: Range;

  constructor(ast: IToken, table: Table) {
    if (ast.type !== 'destination') {
      throw Error('Invalid AST token type of ' + ast.type);
    }
    if (ast.children.length !== 1) {
      throw Error('Unexpected children length in Destination');
    }

    const child = ast.children[0];
    switch (ast.children[0].type) {
      case 'range':
        this.locationDescriptor = newRange(child, table);
        break;
      case 'component':
        this.locationDescriptor = newComponent(child, table);
        break;
      default:
        throw Error('Unrecognized destination type ' + child.type);
    }
  }

  /**
   * getArity returns the dimensions described by the destination, in rows and
   * columns. Unlike in a Value, a table object is required to resolve the
   * relative references and dimensions of rows/columns.
   */
  public getArity = (table: Table): Arity => this.locationDescriptor.getArity();

  /**
   * merge takes the provided values, and attempts to place them in the
   * location described by this Range in the provided table.
   */
  public readonly merge = (table: Table, value: Value): Table =>
    this.locationDescriptor.merge(table, value);
}

class SingleParamFunctionCall {
  private readonly locationDescriptor: ValueProvider;

  constructor(ast: IToken, table: Table) {
    if (ast.type !== 'destination') {
      throw Error('Invalid AST token type of ' + ast.type);
    }
    if (ast.children.length !== 2) {
      throw Error('Unexpected children length in SingleParamFunctionCall');
    }

    const functionChild = ast.children[0];
    console.log(functionChild.text);
    // "mean" | "sum" | "exp" | "tan" | "sin" | "cos"

    // TODO: Parse the function

    const paramChild = ast.children[0];
    this.locationDescriptor = newValueProvider(paramChild, table);
  }

  public readonly getValue = (table: Table): Value => {
    const inputData = this.locationDescriptor.getValue(table);

    // TODO: Now operate on this input data

    throw Error('Not implemented');
  };
}

const newValueProvider = (ast: IToken, table: Table): ValueProvider => {
  switch (ast.type) {
    case 'range':
      return newRange(ast, table);
    case 'component':
      return newComponent(ast, table);
    case 'single_param_function_call':
      return new SingleParamFunctionCall(ast, table);
    case 'conditional_function_call':
      throw Error('Source.conditional_function_call not implemented');
    case 'algebraic_operation':
      throw Error('Source.algebraic_operation not implemented');
    default:
      throw Error('Unrecognized valueProvider type ' + ast.type);
  }
};

export const parseAndApply = (formulaLines: string[], table: Table): Table => {
  const formulas = flatMap(formulaLines, (line) => parseFormula(line, table));
  return formulas.reduce((prevTable, formula) => {
    return formula.merge(table);
  }, table);
};

/**
 * Parse the provided line, returning any found formulas. A single line may
 * contain zero or more formulas.
 *
 * @param line A line of the form `<!-- TBFM: {FORMULA}::{FORMULA} -->`
 */
export const parseFormula = (line: string, table: Table): Formula[] => {
  const parser = new Grammars.W3C.Parser(parserGrammar);
  const ast = parser.getAST(line);

  if (ast.type !== 'tblfm_line') {
    console.error('Unexpected root element of type ' + ast.type);
    return [];
  }

  if (ast.children.length !== 1) {
    console.error(
      'Unexpected number of formula_list element in root: ' +
        ast.children.length,
    );
    return [];
  }

  const formulas = ast.children[0].children;
  console.debug(`Parsing ${formulas.length} formulas...`);

  return formulas.map((formula) => new Formula(formula, table));
};

const prettyPrintAST = (token: IToken, level = 0): void => {
  console.log(
    '  '.repeat(level) +
      `|-${token.type}${token.children.length === 0 ? '=' + token.text : ''}`,
  );
  if (token.children) {
    token.children.forEach((c) => {
      prettyPrintAST(c, level + 1);
    });
  }
};