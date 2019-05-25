import EmberObject from '@ember/object';
import { Planet, Moon, Star } from 'dummy/tests/support/dummy-models';
import { createStore } from 'dummy/tests/support/store';
import { module, test } from 'qunit';
import { getOwner } from '@ember/application';
import { waitForSource } from 'ember-orbit/test-support';

module('Integration - Model', function(hooks) {
  let store;

  hooks.beforeEach(function() {
    const models = { planet: Planet, moon: Moon, star: Star };
    store = createStore({ models });
  });

  hooks.afterEach(function() {
    store = null;
  });

  test('models are assigned the same owner as the store', async function(assert) {
    const model = await store.addRecord({ type: 'star', name: 'The Sun' });
    assert.ok(getOwner(model), 'model has an owner');
    assert.strictEqual(
      getOwner(model),
      getOwner(store),
      'model has same owner as store'
    );
  });

  test('models can receive registered injections', async function(assert) {
    const Foo = EmberObject.extend({
      bar: 'bar'
    });

    const app = getOwner(store);
    app.register('service:foo', Foo);
    app.inject('data-model:star', 'foo', 'service:foo');

    const model = await store.addRecord({ type: 'star', name: 'The Sun' });
    assert.ok(model.foo, 'service has been injected');
    assert.equal(model.foo.bar, 'bar', 'service is correct');
  });

  test('add new model', async function(assert) {
    const theSun = await store.addRecord({ type: 'star', name: 'The Sun' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });
    const record = await store.addRecord({
      type: 'planet',
      remoteId: 'planet:jupiter',
      name: 'Jupiter',
      sun: theSun,
      moons: [callisto]
    });

    assert.ok(record.id, 'assigned id');
    assert.deepEqual(
      record.identity,
      { id: record.id, type: 'planet' },
      'assigned identity that includes type and id'
    );
    assert.equal(record.name, 'Jupiter', 'assigned specified attribute');
    assert.equal(record.remoteId, 'planet:jupiter', 'assigned secondary key');
    assert.strictEqual(record.sun, theSun, 'assigned hasOne');
    assert.strictEqual([...record.moons][0], callisto, 'assigned hasMany');
  });

  test('remove model', async function(assert) {
    const cache = store.cache;
    const record = await store.addRecord({ type: 'star', name: 'The Sun' });
    await record.remove();

    assert.ok(
      !cache.retrieveRecord('star', record.id),
      'record does not exist in cache'
    );
    assert.ok(record.disconnected, 'record has been disconnected from store');
    assert.throws(
      () => record.name,
      Error,
      'record has been removed from Store'
    );
  });

  test('remove model with relationships', async function(assert) {
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });
    const sun = await store.addRecord({ type: 'star', name: 'Sun' });
    const jupiter = await store.addRecord({
      type: 'planet',
      name: 'Jupiter',
      moons: [callisto],
      sun
    });
    assert.deepEqual(
      [...jupiter.moons],
      [callisto],
      'moons relationship has been added'
    );
    assert.strictEqual(jupiter.sun, sun, 'sun relationship has been added');

    await jupiter.remove();
  });

  test('add to hasMany', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    await jupiter.moons.pushObject(callisto);

    assert.ok(jupiter.moons.includes(callisto), 'added record to hasMany');
    assert.equal(callisto.planet, jupiter, 'updated inverse');
  });

  test('remove from hasMany', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    await jupiter.moons.pushObject(callisto);
    await jupiter.moons.removeObject(callisto);

    assert.ok(!jupiter.moons.includes(callisto), 'removed record from hasMany');
    assert.ok(!callisto.planet, 'updated inverse');
  });

  test('replaceRelatedRecords operation invalidates a relationship on model', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    assert.deepEqual([...jupiter.moons], []); // cache the relationship
    await store.source.update(t =>
      t.replaceRelatedRecords(jupiter, 'moons', [callisto])
    );
    assert.deepEqual(
      [...jupiter.moons],
      [callisto],
      'invalidates the relationship'
    );
  });

  test('replace hasOne with record', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    callisto.set('planet', jupiter);
    await waitForSource(store);

    assert.equal(callisto.planet, jupiter, 'replaced hasOne with record');
    assert.ok(jupiter.moons.includes(callisto), 'updated inverse');
  });

  test('replaceRelatedRecord operation invalidates a relationship on model', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const sun = await store.addRecord({ type: 'star', name: 'Sun' });

    assert.equal(jupiter.sun, null); // cache the relationship
    await store.source.update(t => t.replaceRelatedRecord(jupiter, 'sun', sun));
    assert.equal(jupiter.sun, sun, 'invalidates the relationship');
  });

  test('replace hasOne with null', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    assert.equal(callisto.planet, null, 'hasOne is null');

    callisto.set('planet', jupiter);
    await waitForSource(store);

    assert.equal(callisto.planet, jupiter, 'hasOne is jupiter');

    callisto.set('planet', null);
    await waitForSource(store);

    assert.equal(callisto.planet, null, 'replaced hasOne with null');
    assert.ok(
      !jupiter.moons.includes(callisto),
      'removed from inverse hasMany'
    );
  });

  test('replace attribute on model', async function(assert) {
    const record = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    record.set('name', 'Jupiter2');
    assert.equal(record.name, 'Jupiter2');
  });

  test('replaceAttribute operation invalidates attribute on model', async function(assert) {
    const record = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    assert.equal(record.name, 'Jupiter'); // cache the name
    await store.update(t => t.replaceAttribute(record, 'name', 'Jupiter2'));
    assert.equal(record.name, 'Jupiter2');
  });

  test('replace attributes on model', async function(assert) {
    const record = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    await record.replaceAttributes({
      name: 'Jupiter2',
      classification: 'gas giant2'
    });

    assert.equal(record.name, 'Jupiter2');
    assert.equal(record.classification, 'gas giant2');
  });

  test('replace key', async function(assert) {
    const record = await store.addRecord({
      type: 'planet',
      name: 'Jupiter',
      remoteId: 'planet:jupiter'
    });
    record.set('remoteId', 'planet:joopiter');
    assert.equal(record.remoteId, 'planet:joopiter');
  });

  test('replaceKey operation invalidates key on model', async function(assert) {
    const record = await store.addRecord({
      type: 'planet',
      name: 'Jupiter',
      remoteId: 'planet:jupiter'
    });
    assert.equal(record.remoteId, 'planet:jupiter'); // cache the key
    await store.update(t =>
      t.replaceKey(record, 'remoteId', 'planet:joopiter')
    );
    assert.equal(record.remoteId, 'planet:joopiter');
  });

  test('destroy model', async function(assert) {
    const cache = store.cache;

    const record = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const identifier = record.getProperties('type', 'id');
    record.destroy();

    await waitForSource(store);

    assert.ok(!cache._identityMap.has(identifier), 'removed from identity map');
  });

  test('getData returns underlying record data', async function(assert) {
    const record = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    let recordData = record.getData();
    assert.equal(
      recordData.attributes.name,
      'Jupiter',
      'returns record data (resource)'
    );
  });

  test('getRelatedRecords always returns the same LiveQuery', async function(assert) {
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });
    const sun = await store.addRecord({ type: 'star', name: 'Sun' });
    const jupiter = await store.addRecord({
      type: 'planet',
      name: 'Jupiter',
      moons: [callisto],
      sun
    });
    assert.deepEqual(
      [...jupiter.moons],
      [callisto],
      'moons relationship has been added'
    );
    assert.strictEqual(
      jupiter.moons,
      jupiter.getRelatedRecords('moons'),
      'getRelatedRecords returns the expected LiveQuery'
    );
    assert.strictEqual(
      jupiter.getRelatedRecords('moons'),
      jupiter.getRelatedRecords('moons'),
      'getRelatedRecords does not create additional LiveQueries'
    );
  });

  test('update record', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const sun = await store.addRecord({ type: 'star', name: 'Sun' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    assert.equal(jupiter.name, 'Jupiter');
    assert.equal(jupiter.sun, null);
    assert.deepEqual([...jupiter.moons], []);

    await jupiter.update({
      name: 'Jupiter2',
      sun,
      moons: [callisto]
    });

    assert.equal(jupiter.name, 'Jupiter2');
    assert.equal(jupiter.sun, sun, 'invalidates has one relationship');
    assert.deepEqual(
      [...jupiter.moons],
      [callisto],
      'invalidates has many relationship'
    );
  });

  test('update record with ids', async function(assert) {
    const jupiter = await store.addRecord({ type: 'planet', name: 'Jupiter' });
    const sun = await store.addRecord({ type: 'star', name: 'Sun' });
    const callisto = await store.addRecord({ type: 'moon', name: 'Callisto' });

    assert.equal(jupiter.sun, null);
    assert.deepEqual([...jupiter.moons], []);

    await jupiter.update({
      sun: sun.id,
      moons: [callisto.id]
    });

    assert.equal(jupiter.sun, sun, 'invalidates has one relationship');
    assert.deepEqual(
      [...jupiter.moons],
      [callisto],
      'invalidates has many relationship'
    );
  });
});
