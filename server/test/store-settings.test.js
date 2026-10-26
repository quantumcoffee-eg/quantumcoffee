import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStoreSettings, validateStoreSettings, publicStoreSettings, shippingFeeFromSettings } from '../src/store/settings-values.js';

test('empty owner settings remain unpublished and shipping is unavailable', () => {
  const v=validateStoreSettings(defaultStoreSettings());
  assert.deepEqual(v,defaultStoreSettings());
  assert.equal(shippingFeeFromSettings('cairo',v).error,'SHIPPING_UNAVAILABLE');
  assert.equal(v.payments.cod.enabled,false);
});
test('admin may configure supported shipping fees in Egyptian piastres', () => {
  const s=defaultStoreSettings();s.shipping={cairoGizaPiastres:8500,otherPiastres:12000};
  const v=validateStoreSettings(s);
  assert.equal(shippingFeeFromSettings('giza',v).amount,8500);
  assert.equal(shippingFeeFromSettings('alexandria',v).amount,12000);
  assert.equal(shippingFeeFromSettings('wrong',v).error,'INVALID_GOVERNORATE');
  s.shipping.cairoGizaPiastres=-1;assert.throws(()=>validateStoreSettings(s),/Invalid Cairo/);
});
test('digital payment cannot be enabled without verified receiver instructions', () => {
  const s=defaultStoreSettings();s.payments.instapay.enabled=true;
  assert.throws(()=>validateStoreSettings(s),/InstaPay receiver/);
  s.payments.instapay.recipient='Quantum Coffee';s.payments.instapay.reference='quantum@example';
  assert.equal(validateStoreSettings(s).payments.instapay.enabled,true);
  s.payments.vodafone_cash.enabled=true;s.payments.vodafone_cash.recipient='Quantum Coffee';s.payments.vodafone_cash.phone='abc';
  assert.throws(()=>validateStoreSettings(s),/Valid Vodafone/);
  s.payments.vodafone_cash.phone='01012345678';
  assert.equal(validateStoreSettings(s).payments.vodafone_cash.phone,'01012345678');
});
test('unknown fields, script URLs and unsafe contact details are rejected', () => {
  const s=defaultStoreSettings();s.apiSecret='should-not-store';
  assert.throws(()=>validateStoreSettings(s),/Invalid settings/);
  delete s.apiSecret;s.contact.instagramUrl='javascript:alert(1)';
  assert.throws(()=>validateStoreSettings(s),/Instagram/);
  s.contact.instagramUrl='https://instagram.com/quantumcoffeeeg';
  s.contact.whatsapp='+201012345678';
  assert.equal(validateStoreSettings(s).contact.whatsapp,'+201012345678');
  s.policies.privacy.en='x'.repeat(12001);
  assert.throws(()=>validateStoreSettings(s),/Invalid privacy/);
});
test('public projection never accepts extra server fields', () => {
  const s={...defaultStoreSettings(),_id:'secret',revision:3,internalPassword:'something'};
  assert.deepEqual(Object.keys(publicStoreSettings(s)).sort(),['contact','payments','policies','shipping']);
  s.payments.instapay.reference='hidden-until-approved';
  assert.equal(publicStoreSettings(s).payments.instapay.reference,undefined);
});
