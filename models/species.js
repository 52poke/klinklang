var _ = require('underscore');
var db = require('../models/database').base;

var languageToId = {zh: 4, en: 9, ja: 1};

exports.needle = function(species) {
  return isNaN(species)
    ? '(SELECT pokemon_species_id FROM pokemon_species_names WHERE local_language_id = 4 AND name = ?)'
    : '?';
};

exports.name = function(species, language, callback){
  db.get('SELECT name FROM pokemon_species_names WHERE pokemon_species_id = ? AND local_language_id = ?', [parseInt(species), languageToId[language]], function(err, row){
    if (err) return callback(err);
    // Fallback to Japanese
    if (!row && language != 'ja') return exports.name(species, 'ja', callback);

    callback(null, row && row.name);
  });
};

exports.generation = function(species, callback){
  if (!isNaN(species)) species = parseInt(species);
  
  db.get('SELECT generation_id FROM pokemon_species WHERE id = ' + exports.needle(species), [species], function(err, row){
    if (err) return callback(err);
    return callback(null, row && row.generation_id);
  });
};

exports.typeName = function(species, callback){
  if (!isNaN(species)) species = parseInt(species);
  
  db.all('SELECT type_names.name AS name, slot FROM pokemon_types JOIN type_names ON pokemon_types.type_id = type_names.type_id WHERE local_language_id = 4 AND pokemon_id = ' + exports.needle(species), [species], function(err, rows){
    if (err) return callback(err);

    var result = [];
    _.each(rows, function(row){
      result[row.slot - 1] = row.name;
    });
    callback(null, result);
  });
};

exports.allNames = function(language, callback){
  db.all('SELECT pokemon_species_id, name FROM pokemon_species_names WHERE local_language_id = ?', [languageToId[language]], function(err, rows){
    if (err) return callback(err);

    var result = {};
    _.each(rows, function(row){
      result[row.pokemon_species_id] = row.name;
    });
    callback(null, result);
  });
};