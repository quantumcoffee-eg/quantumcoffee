import test from 'node:test';
import assert from 'node:assert/strict';
import { PREPARATION_CODES, DEFAULT_SIZE_GRAMS, totalVariantStock, summaryFromSizes, currentSizes } from '../src/catalog/grinds.js';
import { PREPARATIONS, preparationName } from '../../client/src/lib/grinds.js';
test('frontend and backend preparation identifiers stay identical',()=>{
  assert.deepEqual(PREPARATIONS.map(p=>p.code),PREPARATION_CODES);
  assert.equal(DEFAULT_SIZE_GRAMS,250);
  assert.equal(preparationName('turkish_spiced','ar'),'تركي محوج');
});
test('variant stocks add up and no recipe surcharge is encoded',()=>{
  assert.equal(totalVariantStock([{grams:250,grindOptions:[{code:'espresso',stockQuantity:10},{code:'whole_beans',stockQuantity:10}]},{grams:1000,grindOptions:[{code:'espresso',stockQuantity:3}]}]),23);
  for(const entry of PREPARATIONS){assert.ok(entry.ar);assert.ok(entry.en);assert.deepEqual(Object.keys(entry).sort(),['ar','code','en']);}
});

test('dynamic size summary and legacy read projection preserve original catalog options',()=>{
 const sizes=[{grams:500,pricePiastres:50000,compareAtPiastres:null,grindOptions:[{code:'espresso',stockQuantity:10}]},{grams:250,pricePiastres:30000,compareAtPiastres:35000,grindOptions:[{code:'whole_beans',stockQuantity:5}]}];
 assert.deepEqual(summaryFromSizes(sizes),{pricePiastres:30000,compareAtPiastres:35000,stockQuantity:15});
 assert.equal(currentSizes({packGrams:250,pricePiastres:45000,grindOptions:[{code:'espresso',stockQuantity:10}]}).length,1);
});
