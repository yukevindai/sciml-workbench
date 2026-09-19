/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */
"use strict";
exports.validateProjectResponse = validate32;
const schema32 = {"additionalProperties":false,"properties":{"id":{"maxLength":160,"minLength":1,"title":"Id","type":"string"},"name":{"title":"Name","type":"string"},"description":{"title":"Description","type":"string"}},"required":["id","name","description"],"title":"ProjectResponse","type":"object"};
const func1 = require("ajv/dist/runtime/ucs2length").default;

function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.description === undefined) && (missing0 = "description"))){
validate32.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "id") || (key0 === "name")) || (key0 === "description"))){
validate32.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
let data0 = data.id;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func1(data0) > 160){
validate32.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data0) < 1){
validate32.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate32.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs4 = errors;
if(typeof data.name !== "string"){
validate32.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.description !== undefined){
const _errs6 = errors;
if(typeof data.description !== "string"){
validate32.errors = [{instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
else {
validate32.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate32.errors = vErrors;
return errors === 0;
}
validate32.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

exports.validateProjectsResponse = validate33;
const schema33 = {"type":"array","items":{"$ref":"#/$defs/ProjectResponse"}};

function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing0;
if((((data0.id === undefined) && (missing0 = "id")) || ((data0.name === undefined) && (missing0 = "name"))) || ((data0.description === undefined) && (missing0 = "description"))){
validate33.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/ProjectResponse/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs4 = errors;
for(const key0 in data0){
if(!(((key0 === "id") || (key0 === "name")) || (key0 === "description"))){
validate33.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/ProjectResponse/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs4 === errors){
if(data0.id !== undefined){
let data1 = data0.id;
const _errs5 = errors;
if(errors === _errs5){
if(typeof data1 === "string"){
if(func1(data1) > 160){
validate33.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/ProjectResponse/properties/id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data1) < 1){
validate33.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/ProjectResponse/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate33.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/ProjectResponse/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid2 = _errs5 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.name !== undefined){
const _errs7 = errors;
if(typeof data0.name !== "string"){
validate33.errors = [{instancePath:instancePath+"/" + i0+"/name",schemaPath:"#/$defs/ProjectResponse/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs7 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.description !== undefined){
const _errs9 = errors;
if(typeof data0.description !== "string"){
validate33.errors = [{instancePath:instancePath+"/" + i0+"/description",schemaPath:"#/$defs/ProjectResponse/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
}
else {
validate33.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/ProjectResponse/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
}
else {
validate33.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate33.errors = vErrors;
return errors === 0;
}
validate33.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

exports.validateLegacyJobResponse = validate34;
const schema35 = {"additionalProperties":false,"properties":{"id":{"maxLength":160,"minLength":1,"title":"Id","type":"string"},"project_id":{"maxLength":160,"minLength":1,"title":"Project Id","type":"string"},"kind":{"enum":["audit","split","benchmark","evidence","failure","report"],"title":"Kind","type":"string"},"state":{"enum":["queued","running","succeeded","failed"],"title":"State","type":"string"},"result_id":{"anyOf":[{"maxLength":160,"minLength":1,"type":"string"},{"type":"null"}],"title":"Result Id"},"error":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Error"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"started_at":{"anyOf":[{"format":"date-time","type":"string"},{"type":"null"}],"title":"Started At"},"finished_at":{"anyOf":[{"format":"date-time","type":"string"},{"type":"null"}],"title":"Finished At"}},"required":["id","project_id","kind","state","result_id","error","created_at","started_at","finished_at"],"title":"LegacyJobResponse","type":"object"};
const func5 = Object.prototype.hasOwnProperty;
const formats0 = require("ajv-formats/dist/formats").fullFormats["date-time"];

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((((data.id === undefined) && (missing0 = "id")) || ((data.project_id === undefined) && (missing0 = "project_id"))) || ((data.kind === undefined) && (missing0 = "kind"))) || ((data.state === undefined) && (missing0 = "state"))) || ((data.result_id === undefined) && (missing0 = "result_id"))) || ((data.error === undefined) && (missing0 = "error"))) || ((data.created_at === undefined) && (missing0 = "created_at"))) || ((data.started_at === undefined) && (missing0 = "started_at"))) || ((data.finished_at === undefined) && (missing0 = "finished_at"))){
validate34.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func5.call(schema35.properties, key0))){
validate34.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
let data0 = data.id;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func1(data0) > 160){
validate34.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data0) < 1){
validate34.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.project_id !== undefined){
let data1 = data.project_id;
const _errs4 = errors;
if(errors === _errs4){
if(typeof data1 === "string"){
if(func1(data1) > 160){
validate34.errors = [{instancePath:instancePath+"/project_id",schemaPath:"#/properties/project_id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data1) < 1){
validate34.errors = [{instancePath:instancePath+"/project_id",schemaPath:"#/properties/project_id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/project_id",schemaPath:"#/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs6 = errors;
if(typeof data2 !== "string"){
validate34.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((((((data2 === "audit") || (data2 === "split")) || (data2 === "benchmark")) || (data2 === "evidence")) || (data2 === "failure")) || (data2 === "report"))){
validate34.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema35.properties.kind.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.state !== undefined){
let data3 = data.state;
const _errs8 = errors;
if(typeof data3 !== "string"){
validate34.errors = [{instancePath:instancePath+"/state",schemaPath:"#/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((((data3 === "queued") || (data3 === "running")) || (data3 === "succeeded")) || (data3 === "failed"))){
validate34.errors = [{instancePath:instancePath+"/state",schemaPath:"#/properties/state/enum",keyword:"enum",params:{allowedValues: schema35.properties.state.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.result_id !== undefined){
let data4 = data.result_id;
const _errs10 = errors;
const _errs11 = errors;
let valid1 = false;
const _errs12 = errors;
if(errors === _errs12){
if(typeof data4 === "string"){
if(func1(data4) > 160){
const err0 = {instancePath:instancePath+"/result_id",schemaPath:"#/properties/result_id/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(func1(data4) < 1){
const err1 = {instancePath:instancePath+"/result_id",schemaPath:"#/properties/result_id/anyOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
else {
const err2 = {instancePath:instancePath+"/result_id",schemaPath:"#/properties/result_id/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var _valid0 = _errs12 === errors;
valid1 = valid1 || _valid0;
const _errs14 = errors;
if(data4 !== null){
const err3 = {instancePath:instancePath+"/result_id",schemaPath:"#/properties/result_id/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var _valid0 = _errs14 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err4 = {instancePath:instancePath+"/result_id",schemaPath:"#/properties/result_id/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
validate34.errors = vErrors;
return false;
}
else {
errors = _errs11;
if(vErrors !== null){
if(_errs11){
vErrors.length = _errs11;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs10 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.error !== undefined){
let data5 = data.error;
const _errs16 = errors;
const _errs17 = errors;
let valid2 = false;
const _errs18 = errors;
if(typeof data5 !== "string"){
const err5 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid2 = valid2 || _valid1;
const _errs20 = errors;
if(data5 !== null){
const err6 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid1 = _errs20 === errors;
valid2 = valid2 || _valid1;
if(!valid2){
const err7 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
validate34.errors = vErrors;
return false;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs16 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.created_at !== undefined){
let data6 = data.created_at;
const _errs22 = errors;
if(errors === _errs22){
if(errors === _errs22){
if(typeof data6 === "string"){
if(!(formats0.validate(data6))){
validate34.errors = [{instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""}];
return false;
}
}
else {
validate34.errors = [{instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
}
var valid0 = _errs22 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.started_at !== undefined){
let data7 = data.started_at;
const _errs24 = errors;
const _errs25 = errors;
let valid3 = false;
const _errs26 = errors;
if(errors === _errs26){
if(errors === _errs26){
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err8 = {instancePath:instancePath+"/started_at",schemaPath:"#/properties/started_at/anyOf/0/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/started_at",schemaPath:"#/properties/started_at/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
var _valid2 = _errs26 === errors;
valid3 = valid3 || _valid2;
const _errs28 = errors;
if(data7 !== null){
const err10 = {instancePath:instancePath+"/started_at",schemaPath:"#/properties/started_at/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid2 = _errs28 === errors;
valid3 = valid3 || _valid2;
if(!valid3){
const err11 = {instancePath:instancePath+"/started_at",schemaPath:"#/properties/started_at/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
validate34.errors = vErrors;
return false;
}
else {
errors = _errs25;
if(vErrors !== null){
if(_errs25){
vErrors.length = _errs25;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs24 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.finished_at !== undefined){
let data8 = data.finished_at;
const _errs30 = errors;
const _errs31 = errors;
let valid4 = false;
const _errs32 = errors;
if(errors === _errs32){
if(errors === _errs32){
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err12 = {instancePath:instancePath+"/finished_at",schemaPath:"#/properties/finished_at/anyOf/0/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/finished_at",schemaPath:"#/properties/finished_at/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
var _valid3 = _errs32 === errors;
valid4 = valid4 || _valid3;
const _errs34 = errors;
if(data8 !== null){
const err14 = {instancePath:instancePath+"/finished_at",schemaPath:"#/properties/finished_at/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid3 = _errs34 === errors;
valid4 = valid4 || _valid3;
if(!valid4){
const err15 = {instancePath:instancePath+"/finished_at",schemaPath:"#/properties/finished_at/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
validate34.errors = vErrors;
return false;
}
else {
errors = _errs31;
if(vErrors !== null){
if(_errs31){
vErrors.length = _errs31;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs30 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate34.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

exports.validateJobsResponse = validate35;
const schema36 = {"type":"array","items":{"$ref":"#/$defs/LegacyJobResponse"}};

function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate35.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing0;
if((((((((((data0.id === undefined) && (missing0 = "id")) || ((data0.project_id === undefined) && (missing0 = "project_id"))) || ((data0.kind === undefined) && (missing0 = "kind"))) || ((data0.state === undefined) && (missing0 = "state"))) || ((data0.result_id === undefined) && (missing0 = "result_id"))) || ((data0.error === undefined) && (missing0 = "error"))) || ((data0.created_at === undefined) && (missing0 = "created_at"))) || ((data0.started_at === undefined) && (missing0 = "started_at"))) || ((data0.finished_at === undefined) && (missing0 = "finished_at"))){
validate35.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/LegacyJobResponse/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs4 = errors;
for(const key0 in data0){
if(!(func5.call(schema35.properties, key0))){
validate35.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/LegacyJobResponse/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs4 === errors){
if(data0.id !== undefined){
let data1 = data0.id;
const _errs5 = errors;
if(errors === _errs5){
if(typeof data1 === "string"){
if(func1(data1) > 160){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/LegacyJobResponse/properties/id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data1) < 1){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/LegacyJobResponse/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate35.errors = [{instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/LegacyJobResponse/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid2 = _errs5 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.project_id !== undefined){
let data2 = data0.project_id;
const _errs7 = errors;
if(errors === _errs7){
if(typeof data2 === "string"){
if(func1(data2) > 160){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/LegacyJobResponse/properties/project_id/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func1(data2) < 1){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/LegacyJobResponse/properties/project_id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate35.errors = [{instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/LegacyJobResponse/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid2 = _errs7 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.kind !== undefined){
let data3 = data0.kind;
const _errs9 = errors;
if(typeof data3 !== "string"){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/LegacyJobResponse/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((((((data3 === "audit") || (data3 === "split")) || (data3 === "benchmark")) || (data3 === "evidence")) || (data3 === "failure")) || (data3 === "report"))){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/LegacyJobResponse/properties/kind/enum",keyword:"enum",params:{allowedValues: schema35.properties.kind.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.state !== undefined){
let data4 = data0.state;
const _errs11 = errors;
if(typeof data4 !== "string"){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/state",schemaPath:"#/$defs/LegacyJobResponse/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((((data4 === "queued") || (data4 === "running")) || (data4 === "succeeded")) || (data4 === "failed"))){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/state",schemaPath:"#/$defs/LegacyJobResponse/properties/state/enum",keyword:"enum",params:{allowedValues: schema35.properties.state.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid2 = _errs11 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.result_id !== undefined){
let data5 = data0.result_id;
const _errs13 = errors;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(errors === _errs15){
if(typeof data5 === "string"){
if(func1(data5) > 160){
const err0 = {instancePath:instancePath+"/" + i0+"/result_id",schemaPath:"#/$defs/LegacyJobResponse/properties/result_id/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(func1(data5) < 1){
const err1 = {instancePath:instancePath+"/" + i0+"/result_id",schemaPath:"#/$defs/LegacyJobResponse/properties/result_id/anyOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
else {
const err2 = {instancePath:instancePath+"/" + i0+"/result_id",schemaPath:"#/$defs/LegacyJobResponse/properties/result_id/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var _valid0 = _errs15 === errors;
valid3 = valid3 || _valid0;
const _errs17 = errors;
if(data5 !== null){
const err3 = {instancePath:instancePath+"/" + i0+"/result_id",schemaPath:"#/$defs/LegacyJobResponse/properties/result_id/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var _valid0 = _errs17 === errors;
valid3 = valid3 || _valid0;
if(!valid3){
const err4 = {instancePath:instancePath+"/" + i0+"/result_id",schemaPath:"#/$defs/LegacyJobResponse/properties/result_id/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
validate35.errors = vErrors;
return false;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
var valid2 = _errs13 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.error !== undefined){
let data6 = data0.error;
const _errs19 = errors;
const _errs20 = errors;
let valid4 = false;
const _errs21 = errors;
if(typeof data6 !== "string"){
const err5 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/LegacyJobResponse/properties/error/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid1 = _errs21 === errors;
valid4 = valid4 || _valid1;
const _errs23 = errors;
if(data6 !== null){
const err6 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/LegacyJobResponse/properties/error/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid1 = _errs23 === errors;
valid4 = valid4 || _valid1;
if(!valid4){
const err7 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/LegacyJobResponse/properties/error/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
validate35.errors = vErrors;
return false;
}
else {
errors = _errs20;
if(vErrors !== null){
if(_errs20){
vErrors.length = _errs20;
}
else {
vErrors = null;
}
}
}
var valid2 = _errs19 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.created_at !== undefined){
let data7 = data0.created_at;
const _errs25 = errors;
if(errors === _errs25){
if(errors === _errs25){
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
validate35.errors = [{instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/LegacyJobResponse/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""}];
return false;
}
}
else {
validate35.errors = [{instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/LegacyJobResponse/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
}
var valid2 = _errs25 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.started_at !== undefined){
let data8 = data0.started_at;
const _errs27 = errors;
const _errs28 = errors;
let valid5 = false;
const _errs29 = errors;
if(errors === _errs29){
if(errors === _errs29){
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err8 = {instancePath:instancePath+"/" + i0+"/started_at",schemaPath:"#/$defs/LegacyJobResponse/properties/started_at/anyOf/0/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/" + i0+"/started_at",schemaPath:"#/$defs/LegacyJobResponse/properties/started_at/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
var _valid2 = _errs29 === errors;
valid5 = valid5 || _valid2;
const _errs31 = errors;
if(data8 !== null){
const err10 = {instancePath:instancePath+"/" + i0+"/started_at",schemaPath:"#/$defs/LegacyJobResponse/properties/started_at/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid2 = _errs31 === errors;
valid5 = valid5 || _valid2;
if(!valid5){
const err11 = {instancePath:instancePath+"/" + i0+"/started_at",schemaPath:"#/$defs/LegacyJobResponse/properties/started_at/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
validate35.errors = vErrors;
return false;
}
else {
errors = _errs28;
if(vErrors !== null){
if(_errs28){
vErrors.length = _errs28;
}
else {
vErrors = null;
}
}
}
var valid2 = _errs27 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data0.finished_at !== undefined){
let data9 = data0.finished_at;
const _errs33 = errors;
const _errs34 = errors;
let valid6 = false;
const _errs35 = errors;
if(errors === _errs35){
if(errors === _errs35){
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err12 = {instancePath:instancePath+"/" + i0+"/finished_at",schemaPath:"#/$defs/LegacyJobResponse/properties/finished_at/anyOf/0/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/" + i0+"/finished_at",schemaPath:"#/$defs/LegacyJobResponse/properties/finished_at/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
var _valid3 = _errs35 === errors;
valid6 = valid6 || _valid3;
const _errs37 = errors;
if(data9 !== null){
const err14 = {instancePath:instancePath+"/" + i0+"/finished_at",schemaPath:"#/$defs/LegacyJobResponse/properties/finished_at/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid3 = _errs37 === errors;
valid6 = valid6 || _valid3;
if(!valid6){
const err15 = {instancePath:instancePath+"/" + i0+"/finished_at",schemaPath:"#/$defs/LegacyJobResponse/properties/finished_at/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
validate35.errors = vErrors;
return false;
}
else {
errors = _errs34;
if(vErrors !== null){
if(_errs34){
vErrors.length = _errs34;
}
else {
vErrors = null;
}
}
}
var valid2 = _errs33 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate35.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/LegacyJobResponse/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
}
else {
validate35.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate35.errors = vErrors;
return errors === 0;
}
validate35.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

exports.validateLegacyArtifact = validate36;
const schema38 = {"oneOf":[{"$ref":"#/$defs/Dataset"},{"$ref":"#/$defs/Audit"},{"$ref":"#/$defs/Split"},{"$ref":"#/$defs/Benchmark"},{"$ref":"#/$defs/Evidence"},{"$ref":"#/$defs/Failure"},{"$ref":"#/$defs/Provenance"},{"$ref":"#/$defs/Report"}],"discriminator":{"propertyName":"kind","mapping":{"dataset":"#/$defs/Dataset","audit":"#/$defs/Audit","split":"#/$defs/Split","benchmark":"#/$defs/Benchmark","evidence":"#/$defs/Evidence","failure":"#/$defs/Failure","provenance":"#/$defs/Provenance","report":"#/$defs/Report"}}};
const schema41 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"audit","default":"audit","title":"Kind","type":"string"},"dataset_id":{"title":"Dataset Id","type":"string"},"config":{"additionalProperties":true,"title":"Config","type":"object"},"result":{"additionalProperties":true,"title":"Result","type":"object"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","dataset_id","config","result"],"title":"Audit","type":"object"};
const schema42 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"split","default":"split","title":"Kind","type":"string"},"dataset_id":{"title":"Dataset Id","type":"string"},"audit_id":{"title":"Audit Id","type":"string"},"config":{"additionalProperties":true,"title":"Config","type":"object"},"assignments":{"items":{"enum":["train","validation","test","excluded"],"type":"string"},"title":"Assignments","type":"array"},"result":{"additionalProperties":true,"title":"Result","type":"object"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","dataset_id","audit_id","config","assignments","result"],"title":"Split","type":"object"};
const schema43 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"benchmark","default":"benchmark","title":"Kind","type":"string"},"dataset_id":{"title":"Dataset Id","type":"string"},"split_id":{"title":"Split Id","type":"string"},"model":{"enum":["mean","ridge"],"title":"Model","type":"string"},"seed":{"title":"Seed","type":"integer"},"status":{"enum":["succeeded","failed"],"title":"Status","type":"string"},"result":{"additionalProperties":true,"title":"Result","type":"object"},"error":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Error"},"bundle_key":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Bundle Key"},"config":{"additionalProperties":true,"title":"Config","type":"object"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","dataset_id","split_id","model","seed","status","result","error","bundle_key","config"],"title":"Benchmark","type":"object"};
const schema44 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"evidence","default":"evidence","title":"Kind","type":"string"},"title":{"title":"Title","type":"string"},"pdf_key":{"title":"Pdf Key","type":"string"},"sha256":{"title":"Sha256","type":"string"},"result":{"additionalProperties":true,"title":"Result","type":"object"},"bundle_key":{"title":"Bundle Key","type":"string"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","title","pdf_key","sha256","result","bundle_key"],"title":"Evidence","type":"object"};
const schema45 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"failure","default":"failure","title":"Kind","type":"string"},"benchmark_id":{"title":"Benchmark Id","type":"string"},"external_project_id":{"title":"External Project Id","type":"string"},"external_record_id":{"title":"External Record Id","type":"string"},"reason":{"title":"Reason","type":"string"},"record":{"additionalProperties":true,"title":"Record","type":"object"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","benchmark_id","external_project_id","external_record_id","reason","record"],"title":"Failure","type":"object"};
const schema46 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"provenance","default":"provenance","title":"Kind","type":"string"},"activity":{"title":"Activity","type":"string"},"inputs":{"items":{"type":"string"},"title":"Inputs","type":"array"},"outputs":{"items":{"type":"string"},"title":"Outputs","type":"array"},"parameters":{"additionalProperties":true,"title":"Parameters","type":"object"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","activity","inputs","outputs","parameters"],"title":"Provenance","type":"object"};
const schema47 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"report","default":"report","title":"Kind","type":"string"},"blob_key":{"title":"Blob Key","type":"string"},"sha256":{"title":"Sha256","type":"string"},"artifact_ids":{"items":{"type":"string"},"title":"Artifact Ids","type":"array"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","blob_key","sha256","artifact_ids"],"title":"Report","type":"object"};
const schema39 = {"additionalProperties":false,"properties":{"schema_version":{"const":"1.0","default":"1.0","title":"Schema Version","type":"string"},"id":{"title":"Id","type":"string"},"project_id":{"title":"Project Id","type":"string"},"created_at":{"format":"date-time","title":"Created At","type":"string"},"parents":{"items":{"type":"string"},"title":"Parents","type":"array"},"software":{"additionalProperties":{"type":"string"},"title":"Software","type":"object"},"kind":{"const":"dataset","default":"dataset","title":"Kind","type":"string"},"filename":{"title":"Filename","type":"string"},"blob_key":{"title":"Blob Key","type":"string"},"sha256":{"pattern":"^[a-f0-9]{64}$","title":"Sha256","type":"string"},"rows":{"exclusiveMinimum":0,"title":"Rows","type":"integer"},"columns":{"items":{"type":"string"},"title":"Columns","type":"array"},"source":{"$ref":"#/$defs/Source"}},"required":["schema_version","id","project_id","created_at","parents","software","kind","filename","blob_key","sha256","rows","columns","source"],"title":"Dataset","type":"object"};
const schema40 = {"additionalProperties":false,"properties":{"citation":{"maxLength":2000,"minLength":1,"title":"Citation","type":"string"},"url":{"default":"Not supplied","maxLength":2000,"title":"Url","type":"string"},"license":{"maxLength":200,"minLength":1,"title":"License","type":"string"},"data_kind":{"enum":["empirical","synthetic"],"title":"Data Kind","type":"string"},"transformations":{"maxLength":3000,"minLength":1,"title":"Transformations","type":"string"}},"required":["citation","url","license","data_kind","transformations"],"title":"Source","type":"object"};
const pattern4 = new RegExp("^[a-f0-9]{64}$", "u");

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((((((((data.schema_version === undefined) && (missing0 = "schema_version")) || ((data.id === undefined) && (missing0 = "id"))) || ((data.project_id === undefined) && (missing0 = "project_id"))) || ((data.created_at === undefined) && (missing0 = "created_at"))) || ((data.parents === undefined) && (missing0 = "parents"))) || ((data.software === undefined) && (missing0 = "software"))) || ((data.kind === undefined) && (missing0 = "kind"))) || ((data.filename === undefined) && (missing0 = "filename"))) || ((data.blob_key === undefined) && (missing0 = "blob_key"))) || ((data.sha256 === undefined) && (missing0 = "sha256"))) || ((data.rows === undefined) && (missing0 = "rows"))) || ((data.columns === undefined) && (missing0 = "columns"))) || ((data.source === undefined) && (missing0 = "source"))){
validate26.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func5.call(schema39.properties, key0))){
validate26.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.schema_version !== undefined){
let data0 = data.schema_version;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate26.errors = [{instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if("1.0" !== data0){
validate26.errors = [{instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.id !== undefined){
const _errs4 = errors;
if(typeof data.id !== "string"){
validate26.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.project_id !== undefined){
const _errs6 = errors;
if(typeof data.project_id !== "string"){
validate26.errors = [{instancePath:instancePath+"/project_id",schemaPath:"#/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.created_at !== undefined){
let data3 = data.created_at;
const _errs8 = errors;
if(errors === _errs8){
if(errors === _errs8){
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
validate26.errors = [{instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""}];
return false;
}
}
else {
validate26.errors = [{instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
}
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.parents !== undefined){
let data4 = data.parents;
const _errs10 = errors;
if(errors === _errs10){
if(Array.isArray(data4)){
var valid1 = true;
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
const _errs12 = errors;
if(typeof data4[i0] !== "string"){
validate26.errors = [{instancePath:instancePath+"/parents/" + i0,schemaPath:"#/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs12 === errors;
if(!valid1){
break;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/parents",schemaPath:"#/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs10 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.software !== undefined){
let data6 = data.software;
const _errs14 = errors;
if(errors === _errs14){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
for(const key1 in data6){
const _errs17 = errors;
if(typeof data6[key1] !== "string"){
validate26.errors = [{instancePath:instancePath+"/software/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs17 === errors;
if(!valid2){
break;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/software",schemaPath:"#/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs14 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.kind !== undefined){
let data8 = data.kind;
const _errs19 = errors;
if(typeof data8 !== "string"){
validate26.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if("dataset" !== data8){
validate26.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "dataset"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs19 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.filename !== undefined){
const _errs21 = errors;
if(typeof data.filename !== "string"){
validate26.errors = [{instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs21 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.blob_key !== undefined){
const _errs23 = errors;
if(typeof data.blob_key !== "string"){
validate26.errors = [{instancePath:instancePath+"/blob_key",schemaPath:"#/properties/blob_key/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs23 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sha256 !== undefined){
let data11 = data.sha256;
const _errs25 = errors;
if(errors === _errs25){
if(typeof data11 === "string"){
if(!pattern4.test(data11)){
validate26.errors = [{instancePath:instancePath+"/sha256",schemaPath:"#/properties/sha256/pattern",keyword:"pattern",params:{pattern: "^[a-f0-9]{64}$"},message:"must match pattern \""+"^[a-f0-9]{64}$"+"\""}];
return false;
}
}
else {
validate26.errors = [{instancePath:instancePath+"/sha256",schemaPath:"#/properties/sha256/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs25 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.rows !== undefined){
let data12 = data.rows;
const _errs27 = errors;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
validate26.errors = [{instancePath:instancePath+"/rows",schemaPath:"#/properties/rows/type",keyword:"type",params:{type: "integer"},message:"must be integer"}];
return false;
}
if(errors === _errs27){
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 <= 0 || isNaN(data12)){
validate26.errors = [{instancePath:instancePath+"/rows",schemaPath:"#/properties/rows/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"}];
return false;
}
}
}
var valid0 = _errs27 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.columns !== undefined){
let data13 = data.columns;
const _errs29 = errors;
if(errors === _errs29){
if(Array.isArray(data13)){
var valid3 = true;
const len1 = data13.length;
for(let i1=0; i1<len1; i1++){
const _errs31 = errors;
if(typeof data13[i1] !== "string"){
validate26.errors = [{instancePath:instancePath+"/columns/" + i1,schemaPath:"#/properties/columns/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs31 === errors;
if(!valid3){
break;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/columns",schemaPath:"#/properties/columns/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs29 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.source !== undefined){
let data15 = data.source;
const _errs33 = errors;
const _errs34 = errors;
if(errors === _errs34){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing1;
if((((((data15.citation === undefined) && (missing1 = "citation")) || ((data15.url === undefined) && (missing1 = "url"))) || ((data15.license === undefined) && (missing1 = "license"))) || ((data15.data_kind === undefined) && (missing1 = "data_kind"))) || ((data15.transformations === undefined) && (missing1 = "transformations"))){
validate26.errors = [{instancePath:instancePath+"/source",schemaPath:"#/$defs/Source/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs36 = errors;
for(const key2 in data15){
if(!(((((key2 === "citation") || (key2 === "url")) || (key2 === "license")) || (key2 === "data_kind")) || (key2 === "transformations"))){
validate26.errors = [{instancePath:instancePath+"/source",schemaPath:"#/$defs/Source/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs36 === errors){
if(data15.citation !== undefined){
let data16 = data15.citation;
const _errs37 = errors;
if(errors === _errs37){
if(typeof data16 === "string"){
if(func1(data16) > 2000){
validate26.errors = [{instancePath:instancePath+"/source/citation",schemaPath:"#/$defs/Source/properties/citation/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"}];
return false;
}
else {
if(func1(data16) < 1){
validate26.errors = [{instancePath:instancePath+"/source/citation",schemaPath:"#/$defs/Source/properties/citation/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/source/citation",schemaPath:"#/$defs/Source/properties/citation/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid5 = _errs37 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data15.url !== undefined){
let data17 = data15.url;
const _errs39 = errors;
if(errors === _errs39){
if(typeof data17 === "string"){
if(func1(data17) > 2000){
validate26.errors = [{instancePath:instancePath+"/source/url",schemaPath:"#/$defs/Source/properties/url/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"}];
return false;
}
}
else {
validate26.errors = [{instancePath:instancePath+"/source/url",schemaPath:"#/$defs/Source/properties/url/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid5 = _errs39 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data15.license !== undefined){
let data18 = data15.license;
const _errs41 = errors;
if(errors === _errs41){
if(typeof data18 === "string"){
if(func1(data18) > 200){
validate26.errors = [{instancePath:instancePath+"/source/license",schemaPath:"#/$defs/Source/properties/license/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"}];
return false;
}
else {
if(func1(data18) < 1){
validate26.errors = [{instancePath:instancePath+"/source/license",schemaPath:"#/$defs/Source/properties/license/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/source/license",schemaPath:"#/$defs/Source/properties/license/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid5 = _errs41 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data15.data_kind !== undefined){
let data19 = data15.data_kind;
const _errs43 = errors;
if(typeof data19 !== "string"){
validate26.errors = [{instancePath:instancePath+"/source/data_kind",schemaPath:"#/$defs/Source/properties/data_kind/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data19 === "empirical") || (data19 === "synthetic"))){
validate26.errors = [{instancePath:instancePath+"/source/data_kind",schemaPath:"#/$defs/Source/properties/data_kind/enum",keyword:"enum",params:{allowedValues: schema40.properties.data_kind.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid5 = _errs43 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data15.transformations !== undefined){
let data20 = data15.transformations;
const _errs45 = errors;
if(errors === _errs45){
if(typeof data20 === "string"){
if(func1(data20) > 3000){
validate26.errors = [{instancePath:instancePath+"/source/transformations",schemaPath:"#/$defs/Source/properties/transformations/maxLength",keyword:"maxLength",params:{limit: 3000},message:"must NOT have more than 3000 characters"}];
return false;
}
else {
if(func1(data20) < 1){
validate26.errors = [{instancePath:instancePath+"/source/transformations",schemaPath:"#/$defs/Source/properties/transformations/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/source/transformations",schemaPath:"#/$defs/Source/properties/transformations/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid5 = _errs45 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/source",schemaPath:"#/$defs/Source/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs33 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate26.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(!(validate26(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs2 = errors;
const _errs3 = errors;
if(errors === _errs3){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((((((data.schema_version === undefined) && (missing0 = "schema_version")) || ((data.id === undefined) && (missing0 = "id"))) || ((data.project_id === undefined) && (missing0 = "project_id"))) || ((data.created_at === undefined) && (missing0 = "created_at"))) || ((data.parents === undefined) && (missing0 = "parents"))) || ((data.software === undefined) && (missing0 = "software"))) || ((data.kind === undefined) && (missing0 = "kind"))) || ((data.dataset_id === undefined) && (missing0 = "dataset_id"))) || ((data.config === undefined) && (missing0 = "config"))) || ((data.result === undefined) && (missing0 = "result"))){
const err0 = {instancePath,schemaPath:"#/$defs/Audit/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs5 = errors;
for(const key0 in data){
if(!(func5.call(schema41.properties, key0))){
const err1 = {instancePath,schemaPath:"#/$defs/Audit/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs5 === errors){
if(data.schema_version !== undefined){
let data0 = data.schema_version;
const _errs6 = errors;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Audit/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("1.0" !== data0){
const err3 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Audit/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid2 = _errs6 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.id !== undefined){
const _errs8 = errors;
if(typeof data.id !== "string"){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Audit/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid2 = _errs8 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.project_id !== undefined){
const _errs10 = errors;
if(typeof data.project_id !== "string"){
const err5 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Audit/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid2 = _errs10 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.created_at !== undefined){
let data3 = data.created_at;
const _errs12 = errors;
if(errors === _errs12){
if(errors === _errs12){
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err6 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Audit/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Audit/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
var valid2 = _errs12 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.parents !== undefined){
let data4 = data.parents;
const _errs14 = errors;
if(errors === _errs14){
if(Array.isArray(data4)){
var valid3 = true;
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
const _errs16 = errors;
if(typeof data4[i0] !== "string"){
const err8 = {instancePath:instancePath+"/parents/" + i0,schemaPath:"#/$defs/Audit/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid3 = _errs16 === errors;
if(!valid3){
break;
}
}
}
else {
const err9 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Audit/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var valid2 = _errs14 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.software !== undefined){
let data6 = data.software;
const _errs18 = errors;
if(errors === _errs18){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
for(const key1 in data6){
const _errs21 = errors;
if(typeof data6[key1] !== "string"){
const err10 = {instancePath:instancePath+"/software/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Audit/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var valid4 = _errs21 === errors;
if(!valid4){
break;
}
}
}
else {
const err11 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Audit/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var valid2 = _errs18 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data8 = data.kind;
const _errs23 = errors;
if(typeof data8 !== "string"){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Audit/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("audit" !== data8){
const err13 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Audit/properties/kind/const",keyword:"const",params:{allowedValue: "audit"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid2 = _errs23 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.dataset_id !== undefined){
const _errs25 = errors;
if(typeof data.dataset_id !== "string"){
const err14 = {instancePath:instancePath+"/dataset_id",schemaPath:"#/$defs/Audit/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid2 = _errs25 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.config !== undefined){
let data10 = data.config;
const _errs27 = errors;
if(errors === _errs27){
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err15 = {instancePath:instancePath+"/config",schemaPath:"#/$defs/Audit/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var valid2 = _errs27 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.result !== undefined){
let data11 = data.result;
const _errs30 = errors;
if(errors === _errs30){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
}
else {
const err16 = {instancePath:instancePath+"/result",schemaPath:"#/$defs/Audit/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var valid2 = _errs30 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/$defs/Audit/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
var _valid0 = _errs2 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs33 = errors;
const _errs34 = errors;
if(errors === _errs34){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((((((((((((data.schema_version === undefined) && (missing1 = "schema_version")) || ((data.id === undefined) && (missing1 = "id"))) || ((data.project_id === undefined) && (missing1 = "project_id"))) || ((data.created_at === undefined) && (missing1 = "created_at"))) || ((data.parents === undefined) && (missing1 = "parents"))) || ((data.software === undefined) && (missing1 = "software"))) || ((data.kind === undefined) && (missing1 = "kind"))) || ((data.dataset_id === undefined) && (missing1 = "dataset_id"))) || ((data.audit_id === undefined) && (missing1 = "audit_id"))) || ((data.config === undefined) && (missing1 = "config"))) || ((data.assignments === undefined) && (missing1 = "assignments"))) || ((data.result === undefined) && (missing1 = "result"))){
const err18 = {instancePath,schemaPath:"#/$defs/Split/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
else {
const _errs36 = errors;
for(const key2 in data){
if(!(func5.call(schema42.properties, key2))){
const err19 = {instancePath,schemaPath:"#/$defs/Split/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break;
}
}
if(_errs36 === errors){
if(data.schema_version !== undefined){
let data12 = data.schema_version;
const _errs37 = errors;
if(typeof data12 !== "string"){
const err20 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Split/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("1.0" !== data12){
const err21 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Split/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid6 = _errs37 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.id !== undefined){
const _errs39 = errors;
if(typeof data.id !== "string"){
const err22 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Split/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid6 = _errs39 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.project_id !== undefined){
const _errs41 = errors;
if(typeof data.project_id !== "string"){
const err23 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Split/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.created_at !== undefined){
let data15 = data.created_at;
const _errs43 = errors;
if(errors === _errs43){
if(errors === _errs43){
if(typeof data15 === "string"){
if(!(formats0.validate(data15))){
const err24 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Split/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Split/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
var valid6 = _errs43 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.parents !== undefined){
let data16 = data.parents;
const _errs45 = errors;
if(errors === _errs45){
if(Array.isArray(data16)){
var valid7 = true;
const len1 = data16.length;
for(let i1=0; i1<len1; i1++){
const _errs47 = errors;
if(typeof data16[i1] !== "string"){
const err26 = {instancePath:instancePath+"/parents/" + i1,schemaPath:"#/$defs/Split/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid7 = _errs47 === errors;
if(!valid7){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Split/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid6 = _errs45 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.software !== undefined){
let data18 = data.software;
const _errs49 = errors;
if(errors === _errs49){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
for(const key3 in data18){
const _errs52 = errors;
if(typeof data18[key3] !== "string"){
const err28 = {instancePath:instancePath+"/software/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Split/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var valid8 = _errs52 === errors;
if(!valid8){
break;
}
}
}
else {
const err29 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Split/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
var valid6 = _errs49 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.kind !== undefined){
let data20 = data.kind;
const _errs54 = errors;
if(typeof data20 !== "string"){
const err30 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Split/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if("split" !== data20){
const err31 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Split/properties/kind/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid6 = _errs54 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.dataset_id !== undefined){
const _errs56 = errors;
if(typeof data.dataset_id !== "string"){
const err32 = {instancePath:instancePath+"/dataset_id",schemaPath:"#/$defs/Split/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var valid6 = _errs56 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.audit_id !== undefined){
const _errs58 = errors;
if(typeof data.audit_id !== "string"){
const err33 = {instancePath:instancePath+"/audit_id",schemaPath:"#/$defs/Split/properties/audit_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs58 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.config !== undefined){
let data23 = data.config;
const _errs60 = errors;
if(errors === _errs60){
if(data23 && typeof data23 == "object" && !Array.isArray(data23)){
}
else {
const err34 = {instancePath:instancePath+"/config",schemaPath:"#/$defs/Split/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var valid6 = _errs60 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.assignments !== undefined){
let data24 = data.assignments;
const _errs63 = errors;
if(errors === _errs63){
if(Array.isArray(data24)){
var valid9 = true;
const len2 = data24.length;
for(let i2=0; i2<len2; i2++){
let data25 = data24[i2];
const _errs65 = errors;
if(typeof data25 !== "string"){
const err35 = {instancePath:instancePath+"/assignments/" + i2,schemaPath:"#/$defs/Split/properties/assignments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((data25 === "train") || (data25 === "validation")) || (data25 === "test")) || (data25 === "excluded"))){
const err36 = {instancePath:instancePath+"/assignments/" + i2,schemaPath:"#/$defs/Split/properties/assignments/items/enum",keyword:"enum",params:{allowedValues: schema42.properties.assignments.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid9 = _errs65 === errors;
if(!valid9){
break;
}
}
}
else {
const err37 = {instancePath:instancePath+"/assignments",schemaPath:"#/$defs/Split/properties/assignments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
var valid6 = _errs63 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.result !== undefined){
let data26 = data.result;
const _errs67 = errors;
if(errors === _errs67){
if(data26 && typeof data26 == "object" && !Array.isArray(data26)){
}
else {
const err38 = {instancePath:instancePath+"/result",schemaPath:"#/$defs/Split/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
var valid6 = _errs67 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err39 = {instancePath,schemaPath:"#/$defs/Split/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs70 = errors;
const _errs71 = errors;
if(errors === _errs71){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((((((((((((((((data.schema_version === undefined) && (missing2 = "schema_version")) || ((data.id === undefined) && (missing2 = "id"))) || ((data.project_id === undefined) && (missing2 = "project_id"))) || ((data.created_at === undefined) && (missing2 = "created_at"))) || ((data.parents === undefined) && (missing2 = "parents"))) || ((data.software === undefined) && (missing2 = "software"))) || ((data.kind === undefined) && (missing2 = "kind"))) || ((data.dataset_id === undefined) && (missing2 = "dataset_id"))) || ((data.split_id === undefined) && (missing2 = "split_id"))) || ((data.model === undefined) && (missing2 = "model"))) || ((data.seed === undefined) && (missing2 = "seed"))) || ((data.status === undefined) && (missing2 = "status"))) || ((data.result === undefined) && (missing2 = "result"))) || ((data.error === undefined) && (missing2 = "error"))) || ((data.bundle_key === undefined) && (missing2 = "bundle_key"))) || ((data.config === undefined) && (missing2 = "config"))){
const err40 = {instancePath,schemaPath:"#/$defs/Benchmark/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs73 = errors;
for(const key4 in data){
if(!(func5.call(schema43.properties, key4))){
const err41 = {instancePath,schemaPath:"#/$defs/Benchmark/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data.schema_version !== undefined){
let data27 = data.schema_version;
const _errs74 = errors;
if(typeof data27 !== "string"){
const err42 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Benchmark/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("1.0" !== data27){
const err43 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Benchmark/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid11 = _errs74 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.id !== undefined){
const _errs76 = errors;
if(typeof data.id !== "string"){
const err44 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Benchmark/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid11 = _errs76 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.project_id !== undefined){
const _errs78 = errors;
if(typeof data.project_id !== "string"){
const err45 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Benchmark/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var valid11 = _errs78 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.created_at !== undefined){
let data30 = data.created_at;
const _errs80 = errors;
if(errors === _errs80){
if(errors === _errs80){
if(typeof data30 === "string"){
if(!(formats0.validate(data30))){
const err46 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Benchmark/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Benchmark/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
}
var valid11 = _errs80 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.parents !== undefined){
let data31 = data.parents;
const _errs82 = errors;
if(errors === _errs82){
if(Array.isArray(data31)){
var valid12 = true;
const len3 = data31.length;
for(let i3=0; i3<len3; i3++){
const _errs84 = errors;
if(typeof data31[i3] !== "string"){
const err48 = {instancePath:instancePath+"/parents/" + i3,schemaPath:"#/$defs/Benchmark/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid12 = _errs84 === errors;
if(!valid12){
break;
}
}
}
else {
const err49 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Benchmark/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var valid11 = _errs82 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.software !== undefined){
let data33 = data.software;
const _errs86 = errors;
if(errors === _errs86){
if(data33 && typeof data33 == "object" && !Array.isArray(data33)){
for(const key5 in data33){
const _errs89 = errors;
if(typeof data33[key5] !== "string"){
const err50 = {instancePath:instancePath+"/software/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Benchmark/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
var valid13 = _errs89 === errors;
if(!valid13){
break;
}
}
}
else {
const err51 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Benchmark/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
var valid11 = _errs86 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.kind !== undefined){
let data35 = data.kind;
const _errs91 = errors;
if(typeof data35 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Benchmark/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("benchmark" !== data35){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Benchmark/properties/kind/const",keyword:"const",params:{allowedValue: "benchmark"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid11 = _errs91 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.dataset_id !== undefined){
const _errs93 = errors;
if(typeof data.dataset_id !== "string"){
const err54 = {instancePath:instancePath+"/dataset_id",schemaPath:"#/$defs/Benchmark/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid11 = _errs93 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.split_id !== undefined){
const _errs95 = errors;
if(typeof data.split_id !== "string"){
const err55 = {instancePath:instancePath+"/split_id",schemaPath:"#/$defs/Benchmark/properties/split_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid11 = _errs95 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.model !== undefined){
let data38 = data.model;
const _errs97 = errors;
if(typeof data38 !== "string"){
const err56 = {instancePath:instancePath+"/model",schemaPath:"#/$defs/Benchmark/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(!((data38 === "mean") || (data38 === "ridge"))){
const err57 = {instancePath:instancePath+"/model",schemaPath:"#/$defs/Benchmark/properties/model/enum",keyword:"enum",params:{allowedValues: schema43.properties.model.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid11 = _errs97 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.seed !== undefined){
let data39 = data.seed;
const _errs99 = errors;
if(!(((typeof data39 == "number") && (!(data39 % 1) && !isNaN(data39))) && (isFinite(data39)))){
const err58 = {instancePath:instancePath+"/seed",schemaPath:"#/$defs/Benchmark/properties/seed/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
var valid11 = _errs99 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.status !== undefined){
let data40 = data.status;
const _errs101 = errors;
if(typeof data40 !== "string"){
const err59 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/Benchmark/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!((data40 === "succeeded") || (data40 === "failed"))){
const err60 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/Benchmark/properties/status/enum",keyword:"enum",params:{allowedValues: schema43.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid11 = _errs101 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.result !== undefined){
let data41 = data.result;
const _errs103 = errors;
if(errors === _errs103){
if(data41 && typeof data41 == "object" && !Array.isArray(data41)){
}
else {
const err61 = {instancePath:instancePath+"/result",schemaPath:"#/$defs/Benchmark/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
var valid11 = _errs103 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.error !== undefined){
let data42 = data.error;
const _errs106 = errors;
const _errs107 = errors;
let valid14 = false;
const _errs108 = errors;
if(typeof data42 !== "string"){
const err62 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
var _valid1 = _errs108 === errors;
valid14 = valid14 || _valid1;
const _errs110 = errors;
if(data42 !== null){
const err63 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var _valid1 = _errs110 === errors;
valid14 = valid14 || _valid1;
if(!valid14){
const err64 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
else {
errors = _errs107;
if(vErrors !== null){
if(_errs107){
vErrors.length = _errs107;
}
else {
vErrors = null;
}
}
}
var valid11 = _errs106 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.bundle_key !== undefined){
let data43 = data.bundle_key;
const _errs112 = errors;
const _errs113 = errors;
let valid15 = false;
const _errs114 = errors;
if(typeof data43 !== "string"){
const err65 = {instancePath:instancePath+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid2 = _errs114 === errors;
valid15 = valid15 || _valid2;
const _errs116 = errors;
if(data43 !== null){
const err66 = {instancePath:instancePath+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var _valid2 = _errs116 === errors;
valid15 = valid15 || _valid2;
if(!valid15){
const err67 = {instancePath:instancePath+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
errors = _errs113;
if(vErrors !== null){
if(_errs113){
vErrors.length = _errs113;
}
else {
vErrors = null;
}
}
}
var valid11 = _errs112 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.config !== undefined){
let data44 = data.config;
const _errs118 = errors;
if(errors === _errs118){
if(data44 && typeof data44 == "object" && !Array.isArray(data44)){
}
else {
const err68 = {instancePath:instancePath+"/config",schemaPath:"#/$defs/Benchmark/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
var valid11 = _errs118 === errors;
}
else {
var valid11 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err69 = {instancePath,schemaPath:"#/$defs/Benchmark/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
var _valid0 = _errs70 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs121 = errors;
const _errs122 = errors;
if(errors === _errs122){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if(((((((((((((data.schema_version === undefined) && (missing3 = "schema_version")) || ((data.id === undefined) && (missing3 = "id"))) || ((data.project_id === undefined) && (missing3 = "project_id"))) || ((data.created_at === undefined) && (missing3 = "created_at"))) || ((data.parents === undefined) && (missing3 = "parents"))) || ((data.software === undefined) && (missing3 = "software"))) || ((data.kind === undefined) && (missing3 = "kind"))) || ((data.title === undefined) && (missing3 = "title"))) || ((data.pdf_key === undefined) && (missing3 = "pdf_key"))) || ((data.sha256 === undefined) && (missing3 = "sha256"))) || ((data.result === undefined) && (missing3 = "result"))) || ((data.bundle_key === undefined) && (missing3 = "bundle_key"))){
const err70 = {instancePath,schemaPath:"#/$defs/Evidence/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
else {
const _errs124 = errors;
for(const key6 in data){
if(!(func5.call(schema44.properties, key6))){
const err71 = {instancePath,schemaPath:"#/$defs/Evidence/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
break;
}
}
if(_errs124 === errors){
if(data.schema_version !== undefined){
let data45 = data.schema_version;
const _errs125 = errors;
if(typeof data45 !== "string"){
const err72 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Evidence/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if("1.0" !== data45){
const err73 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Evidence/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid17 = _errs125 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.id !== undefined){
const _errs127 = errors;
if(typeof data.id !== "string"){
const err74 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Evidence/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
var valid17 = _errs127 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.project_id !== undefined){
const _errs129 = errors;
if(typeof data.project_id !== "string"){
const err75 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Evidence/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
var valid17 = _errs129 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.created_at !== undefined){
let data48 = data.created_at;
const _errs131 = errors;
if(errors === _errs131){
if(errors === _errs131){
if(typeof data48 === "string"){
if(!(formats0.validate(data48))){
const err76 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Evidence/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
else {
const err77 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Evidence/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
var valid17 = _errs131 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.parents !== undefined){
let data49 = data.parents;
const _errs133 = errors;
if(errors === _errs133){
if(Array.isArray(data49)){
var valid18 = true;
const len4 = data49.length;
for(let i4=0; i4<len4; i4++){
const _errs135 = errors;
if(typeof data49[i4] !== "string"){
const err78 = {instancePath:instancePath+"/parents/" + i4,schemaPath:"#/$defs/Evidence/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
var valid18 = _errs135 === errors;
if(!valid18){
break;
}
}
}
else {
const err79 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Evidence/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
var valid17 = _errs133 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.software !== undefined){
let data51 = data.software;
const _errs137 = errors;
if(errors === _errs137){
if(data51 && typeof data51 == "object" && !Array.isArray(data51)){
for(const key7 in data51){
const _errs140 = errors;
if(typeof data51[key7] !== "string"){
const err80 = {instancePath:instancePath+"/software/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Evidence/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var valid19 = _errs140 === errors;
if(!valid19){
break;
}
}
}
else {
const err81 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Evidence/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
var valid17 = _errs137 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.kind !== undefined){
let data53 = data.kind;
const _errs142 = errors;
if(typeof data53 !== "string"){
const err82 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Evidence/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if("evidence" !== data53){
const err83 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Evidence/properties/kind/const",keyword:"const",params:{allowedValue: "evidence"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid17 = _errs142 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.title !== undefined){
const _errs144 = errors;
if(typeof data.title !== "string"){
const err84 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/Evidence/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var valid17 = _errs144 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.pdf_key !== undefined){
const _errs146 = errors;
if(typeof data.pdf_key !== "string"){
const err85 = {instancePath:instancePath+"/pdf_key",schemaPath:"#/$defs/Evidence/properties/pdf_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var valid17 = _errs146 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.sha256 !== undefined){
const _errs148 = errors;
if(typeof data.sha256 !== "string"){
const err86 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Evidence/properties/sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var valid17 = _errs148 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.result !== undefined){
let data57 = data.result;
const _errs150 = errors;
if(errors === _errs150){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
}
else {
const err87 = {instancePath:instancePath+"/result",schemaPath:"#/$defs/Evidence/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
var valid17 = _errs150 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.bundle_key !== undefined){
const _errs153 = errors;
if(typeof data.bundle_key !== "string"){
const err88 = {instancePath:instancePath+"/bundle_key",schemaPath:"#/$defs/Evidence/properties/bundle_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid17 = _errs153 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err89 = {instancePath,schemaPath:"#/$defs/Evidence/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var _valid0 = _errs121 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs155 = errors;
const _errs156 = errors;
if(errors === _errs156){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((((((((((((data.schema_version === undefined) && (missing4 = "schema_version")) || ((data.id === undefined) && (missing4 = "id"))) || ((data.project_id === undefined) && (missing4 = "project_id"))) || ((data.created_at === undefined) && (missing4 = "created_at"))) || ((data.parents === undefined) && (missing4 = "parents"))) || ((data.software === undefined) && (missing4 = "software"))) || ((data.kind === undefined) && (missing4 = "kind"))) || ((data.benchmark_id === undefined) && (missing4 = "benchmark_id"))) || ((data.external_project_id === undefined) && (missing4 = "external_project_id"))) || ((data.external_record_id === undefined) && (missing4 = "external_record_id"))) || ((data.reason === undefined) && (missing4 = "reason"))) || ((data.record === undefined) && (missing4 = "record"))){
const err90 = {instancePath,schemaPath:"#/$defs/Failure/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
const _errs158 = errors;
for(const key8 in data){
if(!(func5.call(schema45.properties, key8))){
const err91 = {instancePath,schemaPath:"#/$defs/Failure/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
}
if(_errs158 === errors){
if(data.schema_version !== undefined){
let data59 = data.schema_version;
const _errs159 = errors;
if(typeof data59 !== "string"){
const err92 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Failure/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if("1.0" !== data59){
const err93 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Failure/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var valid21 = _errs159 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.id !== undefined){
const _errs161 = errors;
if(typeof data.id !== "string"){
const err94 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Failure/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid21 = _errs161 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.project_id !== undefined){
const _errs163 = errors;
if(typeof data.project_id !== "string"){
const err95 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Failure/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
var valid21 = _errs163 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.created_at !== undefined){
let data62 = data.created_at;
const _errs165 = errors;
if(errors === _errs165){
if(errors === _errs165){
if(typeof data62 === "string"){
if(!(formats0.validate(data62))){
const err96 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Failure/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Failure/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
}
var valid21 = _errs165 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.parents !== undefined){
let data63 = data.parents;
const _errs167 = errors;
if(errors === _errs167){
if(Array.isArray(data63)){
var valid22 = true;
const len5 = data63.length;
for(let i5=0; i5<len5; i5++){
const _errs169 = errors;
if(typeof data63[i5] !== "string"){
const err98 = {instancePath:instancePath+"/parents/" + i5,schemaPath:"#/$defs/Failure/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
var valid22 = _errs169 === errors;
if(!valid22){
break;
}
}
}
else {
const err99 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Failure/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
var valid21 = _errs167 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.software !== undefined){
let data65 = data.software;
const _errs171 = errors;
if(errors === _errs171){
if(data65 && typeof data65 == "object" && !Array.isArray(data65)){
for(const key9 in data65){
const _errs174 = errors;
if(typeof data65[key9] !== "string"){
const err100 = {instancePath:instancePath+"/software/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Failure/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid23 = _errs174 === errors;
if(!valid23){
break;
}
}
}
else {
const err101 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Failure/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
var valid21 = _errs171 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.kind !== undefined){
let data67 = data.kind;
const _errs176 = errors;
if(typeof data67 !== "string"){
const err102 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Failure/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if("failure" !== data67){
const err103 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Failure/properties/kind/const",keyword:"const",params:{allowedValue: "failure"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
var valid21 = _errs176 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.benchmark_id !== undefined){
const _errs178 = errors;
if(typeof data.benchmark_id !== "string"){
const err104 = {instancePath:instancePath+"/benchmark_id",schemaPath:"#/$defs/Failure/properties/benchmark_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
var valid21 = _errs178 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.external_project_id !== undefined){
const _errs180 = errors;
if(typeof data.external_project_id !== "string"){
const err105 = {instancePath:instancePath+"/external_project_id",schemaPath:"#/$defs/Failure/properties/external_project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var valid21 = _errs180 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.external_record_id !== undefined){
const _errs182 = errors;
if(typeof data.external_record_id !== "string"){
const err106 = {instancePath:instancePath+"/external_record_id",schemaPath:"#/$defs/Failure/properties/external_record_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var valid21 = _errs182 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.reason !== undefined){
const _errs184 = errors;
if(typeof data.reason !== "string"){
const err107 = {instancePath:instancePath+"/reason",schemaPath:"#/$defs/Failure/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var valid21 = _errs184 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.record !== undefined){
let data72 = data.record;
const _errs186 = errors;
if(errors === _errs186){
if(data72 && typeof data72 == "object" && !Array.isArray(data72)){
}
else {
const err108 = {instancePath:instancePath+"/record",schemaPath:"#/$defs/Failure/properties/record/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
var valid21 = _errs186 === errors;
}
else {
var valid21 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err109 = {instancePath,schemaPath:"#/$defs/Failure/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
var _valid0 = _errs155 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
const _errs189 = errors;
const _errs190 = errors;
if(errors === _errs190){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((((((((((data.schema_version === undefined) && (missing5 = "schema_version")) || ((data.id === undefined) && (missing5 = "id"))) || ((data.project_id === undefined) && (missing5 = "project_id"))) || ((data.created_at === undefined) && (missing5 = "created_at"))) || ((data.parents === undefined) && (missing5 = "parents"))) || ((data.software === undefined) && (missing5 = "software"))) || ((data.kind === undefined) && (missing5 = "kind"))) || ((data.activity === undefined) && (missing5 = "activity"))) || ((data.inputs === undefined) && (missing5 = "inputs"))) || ((data.outputs === undefined) && (missing5 = "outputs"))) || ((data.parameters === undefined) && (missing5 = "parameters"))){
const err110 = {instancePath,schemaPath:"#/$defs/Provenance/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
else {
const _errs192 = errors;
for(const key10 in data){
if(!(func5.call(schema46.properties, key10))){
const err111 = {instancePath,schemaPath:"#/$defs/Provenance/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
break;
}
}
if(_errs192 === errors){
if(data.schema_version !== undefined){
let data73 = data.schema_version;
const _errs193 = errors;
if(typeof data73 !== "string"){
const err112 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Provenance/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if("1.0" !== data73){
const err113 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Provenance/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var valid25 = _errs193 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.id !== undefined){
const _errs195 = errors;
if(typeof data.id !== "string"){
const err114 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Provenance/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var valid25 = _errs195 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.project_id !== undefined){
const _errs197 = errors;
if(typeof data.project_id !== "string"){
const err115 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Provenance/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
var valid25 = _errs197 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.created_at !== undefined){
let data76 = data.created_at;
const _errs199 = errors;
if(errors === _errs199){
if(errors === _errs199){
if(typeof data76 === "string"){
if(!(formats0.validate(data76))){
const err116 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Provenance/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
else {
const err117 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Provenance/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
}
var valid25 = _errs199 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.parents !== undefined){
let data77 = data.parents;
const _errs201 = errors;
if(errors === _errs201){
if(Array.isArray(data77)){
var valid26 = true;
const len6 = data77.length;
for(let i6=0; i6<len6; i6++){
const _errs203 = errors;
if(typeof data77[i6] !== "string"){
const err118 = {instancePath:instancePath+"/parents/" + i6,schemaPath:"#/$defs/Provenance/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
var valid26 = _errs203 === errors;
if(!valid26){
break;
}
}
}
else {
const err119 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Provenance/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
var valid25 = _errs201 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.software !== undefined){
let data79 = data.software;
const _errs205 = errors;
if(errors === _errs205){
if(data79 && typeof data79 == "object" && !Array.isArray(data79)){
for(const key11 in data79){
const _errs208 = errors;
if(typeof data79[key11] !== "string"){
const err120 = {instancePath:instancePath+"/software/" + key11.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Provenance/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
var valid27 = _errs208 === errors;
if(!valid27){
break;
}
}
}
else {
const err121 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Provenance/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
var valid25 = _errs205 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.kind !== undefined){
let data81 = data.kind;
const _errs210 = errors;
if(typeof data81 !== "string"){
const err122 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Provenance/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
if("provenance" !== data81){
const err123 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Provenance/properties/kind/const",keyword:"const",params:{allowedValue: "provenance"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var valid25 = _errs210 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.activity !== undefined){
const _errs212 = errors;
if(typeof data.activity !== "string"){
const err124 = {instancePath:instancePath+"/activity",schemaPath:"#/$defs/Provenance/properties/activity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
var valid25 = _errs212 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.inputs !== undefined){
let data83 = data.inputs;
const _errs214 = errors;
if(errors === _errs214){
if(Array.isArray(data83)){
var valid28 = true;
const len7 = data83.length;
for(let i7=0; i7<len7; i7++){
const _errs216 = errors;
if(typeof data83[i7] !== "string"){
const err125 = {instancePath:instancePath+"/inputs/" + i7,schemaPath:"#/$defs/Provenance/properties/inputs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var valid28 = _errs216 === errors;
if(!valid28){
break;
}
}
}
else {
const err126 = {instancePath:instancePath+"/inputs",schemaPath:"#/$defs/Provenance/properties/inputs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
var valid25 = _errs214 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.outputs !== undefined){
let data85 = data.outputs;
const _errs218 = errors;
if(errors === _errs218){
if(Array.isArray(data85)){
var valid29 = true;
const len8 = data85.length;
for(let i8=0; i8<len8; i8++){
const _errs220 = errors;
if(typeof data85[i8] !== "string"){
const err127 = {instancePath:instancePath+"/outputs/" + i8,schemaPath:"#/$defs/Provenance/properties/outputs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
var valid29 = _errs220 === errors;
if(!valid29){
break;
}
}
}
else {
const err128 = {instancePath:instancePath+"/outputs",schemaPath:"#/$defs/Provenance/properties/outputs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
var valid25 = _errs218 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.parameters !== undefined){
let data87 = data.parameters;
const _errs222 = errors;
if(errors === _errs222){
if(data87 && typeof data87 == "object" && !Array.isArray(data87)){
}
else {
const err129 = {instancePath:instancePath+"/parameters",schemaPath:"#/$defs/Provenance/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
var valid25 = _errs222 === errors;
}
else {
var valid25 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err130 = {instancePath,schemaPath:"#/$defs/Provenance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
var _valid0 = _errs189 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
if(props0 !== true){
props0 = true;
}
}
const _errs225 = errors;
const _errs226 = errors;
if(errors === _errs226){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((((((((((data.schema_version === undefined) && (missing6 = "schema_version")) || ((data.id === undefined) && (missing6 = "id"))) || ((data.project_id === undefined) && (missing6 = "project_id"))) || ((data.created_at === undefined) && (missing6 = "created_at"))) || ((data.parents === undefined) && (missing6 = "parents"))) || ((data.software === undefined) && (missing6 = "software"))) || ((data.kind === undefined) && (missing6 = "kind"))) || ((data.blob_key === undefined) && (missing6 = "blob_key"))) || ((data.sha256 === undefined) && (missing6 = "sha256"))) || ((data.artifact_ids === undefined) && (missing6 = "artifact_ids"))){
const err131 = {instancePath,schemaPath:"#/$defs/Report/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
else {
const _errs228 = errors;
for(const key12 in data){
if(!(func5.call(schema47.properties, key12))){
const err132 = {instancePath,schemaPath:"#/$defs/Report/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
break;
}
}
if(_errs228 === errors){
if(data.schema_version !== undefined){
let data88 = data.schema_version;
const _errs229 = errors;
if(typeof data88 !== "string"){
const err133 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Report/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if("1.0" !== data88){
const err134 = {instancePath:instancePath+"/schema_version",schemaPath:"#/$defs/Report/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
var valid31 = _errs229 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.id !== undefined){
const _errs231 = errors;
if(typeof data.id !== "string"){
const err135 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Report/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var valid31 = _errs231 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.project_id !== undefined){
const _errs233 = errors;
if(typeof data.project_id !== "string"){
const err136 = {instancePath:instancePath+"/project_id",schemaPath:"#/$defs/Report/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var valid31 = _errs233 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.created_at !== undefined){
let data91 = data.created_at;
const _errs235 = errors;
if(errors === _errs235){
if(errors === _errs235){
if(typeof data91 === "string"){
if(!(formats0.validate(data91))){
const err137 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Report/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
else {
const err138 = {instancePath:instancePath+"/created_at",schemaPath:"#/$defs/Report/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
}
var valid31 = _errs235 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.parents !== undefined){
let data92 = data.parents;
const _errs237 = errors;
if(errors === _errs237){
if(Array.isArray(data92)){
var valid32 = true;
const len9 = data92.length;
for(let i9=0; i9<len9; i9++){
const _errs239 = errors;
if(typeof data92[i9] !== "string"){
const err139 = {instancePath:instancePath+"/parents/" + i9,schemaPath:"#/$defs/Report/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
var valid32 = _errs239 === errors;
if(!valid32){
break;
}
}
}
else {
const err140 = {instancePath:instancePath+"/parents",schemaPath:"#/$defs/Report/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
var valid31 = _errs237 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.software !== undefined){
let data94 = data.software;
const _errs241 = errors;
if(errors === _errs241){
if(data94 && typeof data94 == "object" && !Array.isArray(data94)){
for(const key13 in data94){
const _errs244 = errors;
if(typeof data94[key13] !== "string"){
const err141 = {instancePath:instancePath+"/software/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Report/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
var valid33 = _errs244 === errors;
if(!valid33){
break;
}
}
}
else {
const err142 = {instancePath:instancePath+"/software",schemaPath:"#/$defs/Report/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
var valid31 = _errs241 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.kind !== undefined){
let data96 = data.kind;
const _errs246 = errors;
if(typeof data96 !== "string"){
const err143 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Report/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if("report" !== data96){
const err144 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/Report/properties/kind/const",keyword:"const",params:{allowedValue: "report"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var valid31 = _errs246 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.blob_key !== undefined){
const _errs248 = errors;
if(typeof data.blob_key !== "string"){
const err145 = {instancePath:instancePath+"/blob_key",schemaPath:"#/$defs/Report/properties/blob_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
var valid31 = _errs248 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.sha256 !== undefined){
const _errs250 = errors;
if(typeof data.sha256 !== "string"){
const err146 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Report/properties/sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
var valid31 = _errs250 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.artifact_ids !== undefined){
let data99 = data.artifact_ids;
const _errs252 = errors;
if(errors === _errs252){
if(Array.isArray(data99)){
var valid34 = true;
const len10 = data99.length;
for(let i10=0; i10<len10; i10++){
const _errs254 = errors;
if(typeof data99[i10] !== "string"){
const err147 = {instancePath:instancePath+"/artifact_ids/" + i10,schemaPath:"#/$defs/Report/properties/artifact_ids/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var valid34 = _errs254 === errors;
if(!valid34){
break;
}
}
}
else {
const err148 = {instancePath:instancePath+"/artifact_ids",schemaPath:"#/$defs/Report/properties/artifact_ids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
var valid31 = _errs252 === errors;
}
else {
var valid31 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err149 = {instancePath,schemaPath:"#/$defs/Report/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
var _valid0 = _errs225 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
}
}
if(!valid0){
const err150 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
validate36.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate36.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate36.evaluated = {"dynamicProps":true,"dynamicItems":false};

exports.validateArtifactsResponse = validate38;
const schema48 = {"type":"array","items":{"oneOf":[{"$ref":"#/$defs/Dataset"},{"$ref":"#/$defs/Audit"},{"$ref":"#/$defs/Split"},{"$ref":"#/$defs/Benchmark"},{"$ref":"#/$defs/Evidence"},{"$ref":"#/$defs/Failure"},{"$ref":"#/$defs/Provenance"},{"$ref":"#/$defs/Report"}],"discriminator":{"propertyName":"kind","mapping":{"dataset":"#/$defs/Dataset","audit":"#/$defs/Audit","split":"#/$defs/Split","benchmark":"#/$defs/Benchmark","evidence":"#/$defs/Evidence","failure":"#/$defs/Failure","provenance":"#/$defs/Provenance","report":"#/$defs/Report"}}}};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
let valid1 = false;
let passing0 = null;
const _errs3 = errors;
if(!(validate26(data0, {instancePath:instancePath+"/" + i0,parentData:data,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
var _valid0 = _errs3 === errors;
if(_valid0){
valid1 = true;
passing0 = 0;
var props0 = true;
}
const _errs4 = errors;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing0;
if(((((((((((data0.schema_version === undefined) && (missing0 = "schema_version")) || ((data0.id === undefined) && (missing0 = "id"))) || ((data0.project_id === undefined) && (missing0 = "project_id"))) || ((data0.created_at === undefined) && (missing0 = "created_at"))) || ((data0.parents === undefined) && (missing0 = "parents"))) || ((data0.software === undefined) && (missing0 = "software"))) || ((data0.kind === undefined) && (missing0 = "kind"))) || ((data0.dataset_id === undefined) && (missing0 = "dataset_id"))) || ((data0.config === undefined) && (missing0 = "config"))) || ((data0.result === undefined) && (missing0 = "result"))){
const err0 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Audit/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs7 = errors;
for(const key0 in data0){
if(!(func5.call(schema41.properties, key0))){
const err1 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Audit/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs7 === errors){
if(data0.schema_version !== undefined){
let data1 = data0.schema_version;
const _errs8 = errors;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Audit/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("1.0" !== data1){
const err3 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Audit/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid3 = _errs8 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.id !== undefined){
const _errs10 = errors;
if(typeof data0.id !== "string"){
const err4 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Audit/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid3 = _errs10 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.project_id !== undefined){
const _errs12 = errors;
if(typeof data0.project_id !== "string"){
const err5 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Audit/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid3 = _errs12 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.created_at !== undefined){
let data4 = data0.created_at;
const _errs14 = errors;
if(errors === _errs14){
if(errors === _errs14){
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err6 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Audit/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Audit/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.parents !== undefined){
let data5 = data0.parents;
const _errs16 = errors;
if(errors === _errs16){
if(Array.isArray(data5)){
var valid4 = true;
const len1 = data5.length;
for(let i1=0; i1<len1; i1++){
const _errs18 = errors;
if(typeof data5[i1] !== "string"){
const err8 = {instancePath:instancePath+"/" + i0+"/parents/" + i1,schemaPath:"#/$defs/Audit/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid4 = _errs18 === errors;
if(!valid4){
break;
}
}
}
else {
const err9 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Audit/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.software !== undefined){
let data7 = data0.software;
const _errs20 = errors;
if(errors === _errs20){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
for(const key1 in data7){
const _errs23 = errors;
if(typeof data7[key1] !== "string"){
const err10 = {instancePath:instancePath+"/" + i0+"/software/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Audit/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var valid5 = _errs23 === errors;
if(!valid5){
break;
}
}
}
else {
const err11 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Audit/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var valid3 = _errs20 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.kind !== undefined){
let data9 = data0.kind;
const _errs25 = errors;
if(typeof data9 !== "string"){
const err12 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Audit/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("audit" !== data9){
const err13 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Audit/properties/kind/const",keyword:"const",params:{allowedValue: "audit"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs25 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.dataset_id !== undefined){
const _errs27 = errors;
if(typeof data0.dataset_id !== "string"){
const err14 = {instancePath:instancePath+"/" + i0+"/dataset_id",schemaPath:"#/$defs/Audit/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid3 = _errs27 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.config !== undefined){
let data11 = data0.config;
const _errs29 = errors;
if(errors === _errs29){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
}
else {
const err15 = {instancePath:instancePath+"/" + i0+"/config",schemaPath:"#/$defs/Audit/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var valid3 = _errs29 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.result !== undefined){
let data12 = data0.result;
const _errs32 = errors;
if(errors === _errs32){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
}
else {
const err16 = {instancePath:instancePath+"/" + i0+"/result",schemaPath:"#/$defs/Audit/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var valid3 = _errs32 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err17 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Audit/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
var _valid0 = _errs4 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid1 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs35 = errors;
const _errs36 = errors;
if(errors === _errs36){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if(((((((((((((data0.schema_version === undefined) && (missing1 = "schema_version")) || ((data0.id === undefined) && (missing1 = "id"))) || ((data0.project_id === undefined) && (missing1 = "project_id"))) || ((data0.created_at === undefined) && (missing1 = "created_at"))) || ((data0.parents === undefined) && (missing1 = "parents"))) || ((data0.software === undefined) && (missing1 = "software"))) || ((data0.kind === undefined) && (missing1 = "kind"))) || ((data0.dataset_id === undefined) && (missing1 = "dataset_id"))) || ((data0.audit_id === undefined) && (missing1 = "audit_id"))) || ((data0.config === undefined) && (missing1 = "config"))) || ((data0.assignments === undefined) && (missing1 = "assignments"))) || ((data0.result === undefined) && (missing1 = "result"))){
const err18 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Split/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
else {
const _errs38 = errors;
for(const key2 in data0){
if(!(func5.call(schema42.properties, key2))){
const err19 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Split/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break;
}
}
if(_errs38 === errors){
if(data0.schema_version !== undefined){
let data13 = data0.schema_version;
const _errs39 = errors;
if(typeof data13 !== "string"){
const err20 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Split/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("1.0" !== data13){
const err21 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Split/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid7 = _errs39 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.id !== undefined){
const _errs41 = errors;
if(typeof data0.id !== "string"){
const err22 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Split/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid7 = _errs41 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.project_id !== undefined){
const _errs43 = errors;
if(typeof data0.project_id !== "string"){
const err23 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Split/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid7 = _errs43 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.created_at !== undefined){
let data16 = data0.created_at;
const _errs45 = errors;
if(errors === _errs45){
if(errors === _errs45){
if(typeof data16 === "string"){
if(!(formats0.validate(data16))){
const err24 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Split/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Split/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
var valid7 = _errs45 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.parents !== undefined){
let data17 = data0.parents;
const _errs47 = errors;
if(errors === _errs47){
if(Array.isArray(data17)){
var valid8 = true;
const len2 = data17.length;
for(let i2=0; i2<len2; i2++){
const _errs49 = errors;
if(typeof data17[i2] !== "string"){
const err26 = {instancePath:instancePath+"/" + i0+"/parents/" + i2,schemaPath:"#/$defs/Split/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid8 = _errs49 === errors;
if(!valid8){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Split/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid7 = _errs47 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.software !== undefined){
let data19 = data0.software;
const _errs51 = errors;
if(errors === _errs51){
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
for(const key3 in data19){
const _errs54 = errors;
if(typeof data19[key3] !== "string"){
const err28 = {instancePath:instancePath+"/" + i0+"/software/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Split/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var valid9 = _errs54 === errors;
if(!valid9){
break;
}
}
}
else {
const err29 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Split/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
var valid7 = _errs51 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.kind !== undefined){
let data21 = data0.kind;
const _errs56 = errors;
if(typeof data21 !== "string"){
const err30 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Split/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if("split" !== data21){
const err31 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Split/properties/kind/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid7 = _errs56 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.dataset_id !== undefined){
const _errs58 = errors;
if(typeof data0.dataset_id !== "string"){
const err32 = {instancePath:instancePath+"/" + i0+"/dataset_id",schemaPath:"#/$defs/Split/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var valid7 = _errs58 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.audit_id !== undefined){
const _errs60 = errors;
if(typeof data0.audit_id !== "string"){
const err33 = {instancePath:instancePath+"/" + i0+"/audit_id",schemaPath:"#/$defs/Split/properties/audit_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid7 = _errs60 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.config !== undefined){
let data24 = data0.config;
const _errs62 = errors;
if(errors === _errs62){
if(data24 && typeof data24 == "object" && !Array.isArray(data24)){
}
else {
const err34 = {instancePath:instancePath+"/" + i0+"/config",schemaPath:"#/$defs/Split/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var valid7 = _errs62 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.assignments !== undefined){
let data25 = data0.assignments;
const _errs65 = errors;
if(errors === _errs65){
if(Array.isArray(data25)){
var valid10 = true;
const len3 = data25.length;
for(let i3=0; i3<len3; i3++){
let data26 = data25[i3];
const _errs67 = errors;
if(typeof data26 !== "string"){
const err35 = {instancePath:instancePath+"/" + i0+"/assignments/" + i3,schemaPath:"#/$defs/Split/properties/assignments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((data26 === "train") || (data26 === "validation")) || (data26 === "test")) || (data26 === "excluded"))){
const err36 = {instancePath:instancePath+"/" + i0+"/assignments/" + i3,schemaPath:"#/$defs/Split/properties/assignments/items/enum",keyword:"enum",params:{allowedValues: schema42.properties.assignments.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid10 = _errs67 === errors;
if(!valid10){
break;
}
}
}
else {
const err37 = {instancePath:instancePath+"/" + i0+"/assignments",schemaPath:"#/$defs/Split/properties/assignments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
var valid7 = _errs65 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.result !== undefined){
let data27 = data0.result;
const _errs69 = errors;
if(errors === _errs69){
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
}
else {
const err38 = {instancePath:instancePath+"/" + i0+"/result",schemaPath:"#/$defs/Split/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
var valid7 = _errs69 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Split/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid0 = _errs35 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid1 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs72 = errors;
const _errs73 = errors;
if(errors === _errs73){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing2;
if(((((((((((((((((data0.schema_version === undefined) && (missing2 = "schema_version")) || ((data0.id === undefined) && (missing2 = "id"))) || ((data0.project_id === undefined) && (missing2 = "project_id"))) || ((data0.created_at === undefined) && (missing2 = "created_at"))) || ((data0.parents === undefined) && (missing2 = "parents"))) || ((data0.software === undefined) && (missing2 = "software"))) || ((data0.kind === undefined) && (missing2 = "kind"))) || ((data0.dataset_id === undefined) && (missing2 = "dataset_id"))) || ((data0.split_id === undefined) && (missing2 = "split_id"))) || ((data0.model === undefined) && (missing2 = "model"))) || ((data0.seed === undefined) && (missing2 = "seed"))) || ((data0.status === undefined) && (missing2 = "status"))) || ((data0.result === undefined) && (missing2 = "result"))) || ((data0.error === undefined) && (missing2 = "error"))) || ((data0.bundle_key === undefined) && (missing2 = "bundle_key"))) || ((data0.config === undefined) && (missing2 = "config"))){
const err40 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Benchmark/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs75 = errors;
for(const key4 in data0){
if(!(func5.call(schema43.properties, key4))){
const err41 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Benchmark/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
break;
}
}
if(_errs75 === errors){
if(data0.schema_version !== undefined){
let data28 = data0.schema_version;
const _errs76 = errors;
if(typeof data28 !== "string"){
const err42 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Benchmark/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("1.0" !== data28){
const err43 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Benchmark/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid12 = _errs76 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.id !== undefined){
const _errs78 = errors;
if(typeof data0.id !== "string"){
const err44 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Benchmark/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid12 = _errs78 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.project_id !== undefined){
const _errs80 = errors;
if(typeof data0.project_id !== "string"){
const err45 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Benchmark/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var valid12 = _errs80 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.created_at !== undefined){
let data31 = data0.created_at;
const _errs82 = errors;
if(errors === _errs82){
if(errors === _errs82){
if(typeof data31 === "string"){
if(!(formats0.validate(data31))){
const err46 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Benchmark/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Benchmark/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
}
var valid12 = _errs82 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.parents !== undefined){
let data32 = data0.parents;
const _errs84 = errors;
if(errors === _errs84){
if(Array.isArray(data32)){
var valid13 = true;
const len4 = data32.length;
for(let i4=0; i4<len4; i4++){
const _errs86 = errors;
if(typeof data32[i4] !== "string"){
const err48 = {instancePath:instancePath+"/" + i0+"/parents/" + i4,schemaPath:"#/$defs/Benchmark/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid13 = _errs86 === errors;
if(!valid13){
break;
}
}
}
else {
const err49 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Benchmark/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var valid12 = _errs84 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.software !== undefined){
let data34 = data0.software;
const _errs88 = errors;
if(errors === _errs88){
if(data34 && typeof data34 == "object" && !Array.isArray(data34)){
for(const key5 in data34){
const _errs91 = errors;
if(typeof data34[key5] !== "string"){
const err50 = {instancePath:instancePath+"/" + i0+"/software/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Benchmark/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
var valid14 = _errs91 === errors;
if(!valid14){
break;
}
}
}
else {
const err51 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Benchmark/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
var valid12 = _errs88 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.kind !== undefined){
let data36 = data0.kind;
const _errs93 = errors;
if(typeof data36 !== "string"){
const err52 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Benchmark/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("benchmark" !== data36){
const err53 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Benchmark/properties/kind/const",keyword:"const",params:{allowedValue: "benchmark"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid12 = _errs93 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.dataset_id !== undefined){
const _errs95 = errors;
if(typeof data0.dataset_id !== "string"){
const err54 = {instancePath:instancePath+"/" + i0+"/dataset_id",schemaPath:"#/$defs/Benchmark/properties/dataset_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid12 = _errs95 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.split_id !== undefined){
const _errs97 = errors;
if(typeof data0.split_id !== "string"){
const err55 = {instancePath:instancePath+"/" + i0+"/split_id",schemaPath:"#/$defs/Benchmark/properties/split_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid12 = _errs97 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.model !== undefined){
let data39 = data0.model;
const _errs99 = errors;
if(typeof data39 !== "string"){
const err56 = {instancePath:instancePath+"/" + i0+"/model",schemaPath:"#/$defs/Benchmark/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(!((data39 === "mean") || (data39 === "ridge"))){
const err57 = {instancePath:instancePath+"/" + i0+"/model",schemaPath:"#/$defs/Benchmark/properties/model/enum",keyword:"enum",params:{allowedValues: schema43.properties.model.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid12 = _errs99 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.seed !== undefined){
let data40 = data0.seed;
const _errs101 = errors;
if(!(((typeof data40 == "number") && (!(data40 % 1) && !isNaN(data40))) && (isFinite(data40)))){
const err58 = {instancePath:instancePath+"/" + i0+"/seed",schemaPath:"#/$defs/Benchmark/properties/seed/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
var valid12 = _errs101 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.status !== undefined){
let data41 = data0.status;
const _errs103 = errors;
if(typeof data41 !== "string"){
const err59 = {instancePath:instancePath+"/" + i0+"/status",schemaPath:"#/$defs/Benchmark/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!((data41 === "succeeded") || (data41 === "failed"))){
const err60 = {instancePath:instancePath+"/" + i0+"/status",schemaPath:"#/$defs/Benchmark/properties/status/enum",keyword:"enum",params:{allowedValues: schema43.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid12 = _errs103 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.result !== undefined){
let data42 = data0.result;
const _errs105 = errors;
if(errors === _errs105){
if(data42 && typeof data42 == "object" && !Array.isArray(data42)){
}
else {
const err61 = {instancePath:instancePath+"/" + i0+"/result",schemaPath:"#/$defs/Benchmark/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
var valid12 = _errs105 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.error !== undefined){
let data43 = data0.error;
const _errs108 = errors;
const _errs109 = errors;
let valid15 = false;
const _errs110 = errors;
if(typeof data43 !== "string"){
const err62 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
var _valid1 = _errs110 === errors;
valid15 = valid15 || _valid1;
const _errs112 = errors;
if(data43 !== null){
const err63 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var _valid1 = _errs112 === errors;
valid15 = valid15 || _valid1;
if(!valid15){
const err64 = {instancePath:instancePath+"/" + i0+"/error",schemaPath:"#/$defs/Benchmark/properties/error/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
else {
errors = _errs109;
if(vErrors !== null){
if(_errs109){
vErrors.length = _errs109;
}
else {
vErrors = null;
}
}
}
var valid12 = _errs108 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.bundle_key !== undefined){
let data44 = data0.bundle_key;
const _errs114 = errors;
const _errs115 = errors;
let valid16 = false;
const _errs116 = errors;
if(typeof data44 !== "string"){
const err65 = {instancePath:instancePath+"/" + i0+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid2 = _errs116 === errors;
valid16 = valid16 || _valid2;
const _errs118 = errors;
if(data44 !== null){
const err66 = {instancePath:instancePath+"/" + i0+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var _valid2 = _errs118 === errors;
valid16 = valid16 || _valid2;
if(!valid16){
const err67 = {instancePath:instancePath+"/" + i0+"/bundle_key",schemaPath:"#/$defs/Benchmark/properties/bundle_key/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
errors = _errs115;
if(vErrors !== null){
if(_errs115){
vErrors.length = _errs115;
}
else {
vErrors = null;
}
}
}
var valid12 = _errs114 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data0.config !== undefined){
let data45 = data0.config;
const _errs120 = errors;
if(errors === _errs120){
if(data45 && typeof data45 == "object" && !Array.isArray(data45)){
}
else {
const err68 = {instancePath:instancePath+"/" + i0+"/config",schemaPath:"#/$defs/Benchmark/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
var valid12 = _errs120 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err69 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Benchmark/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
var _valid0 = _errs72 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid1 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs123 = errors;
const _errs124 = errors;
if(errors === _errs124){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if(((((((((((((data0.schema_version === undefined) && (missing3 = "schema_version")) || ((data0.id === undefined) && (missing3 = "id"))) || ((data0.project_id === undefined) && (missing3 = "project_id"))) || ((data0.created_at === undefined) && (missing3 = "created_at"))) || ((data0.parents === undefined) && (missing3 = "parents"))) || ((data0.software === undefined) && (missing3 = "software"))) || ((data0.kind === undefined) && (missing3 = "kind"))) || ((data0.title === undefined) && (missing3 = "title"))) || ((data0.pdf_key === undefined) && (missing3 = "pdf_key"))) || ((data0.sha256 === undefined) && (missing3 = "sha256"))) || ((data0.result === undefined) && (missing3 = "result"))) || ((data0.bundle_key === undefined) && (missing3 = "bundle_key"))){
const err70 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Evidence/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
else {
const _errs126 = errors;
for(const key6 in data0){
if(!(func5.call(schema44.properties, key6))){
const err71 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Evidence/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
break;
}
}
if(_errs126 === errors){
if(data0.schema_version !== undefined){
let data46 = data0.schema_version;
const _errs127 = errors;
if(typeof data46 !== "string"){
const err72 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Evidence/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if("1.0" !== data46){
const err73 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Evidence/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid18 = _errs127 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.id !== undefined){
const _errs129 = errors;
if(typeof data0.id !== "string"){
const err74 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Evidence/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
var valid18 = _errs129 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.project_id !== undefined){
const _errs131 = errors;
if(typeof data0.project_id !== "string"){
const err75 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Evidence/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
var valid18 = _errs131 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.created_at !== undefined){
let data49 = data0.created_at;
const _errs133 = errors;
if(errors === _errs133){
if(errors === _errs133){
if(typeof data49 === "string"){
if(!(formats0.validate(data49))){
const err76 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Evidence/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
else {
const err77 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Evidence/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
var valid18 = _errs133 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.parents !== undefined){
let data50 = data0.parents;
const _errs135 = errors;
if(errors === _errs135){
if(Array.isArray(data50)){
var valid19 = true;
const len5 = data50.length;
for(let i5=0; i5<len5; i5++){
const _errs137 = errors;
if(typeof data50[i5] !== "string"){
const err78 = {instancePath:instancePath+"/" + i0+"/parents/" + i5,schemaPath:"#/$defs/Evidence/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
var valid19 = _errs137 === errors;
if(!valid19){
break;
}
}
}
else {
const err79 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Evidence/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
var valid18 = _errs135 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.software !== undefined){
let data52 = data0.software;
const _errs139 = errors;
if(errors === _errs139){
if(data52 && typeof data52 == "object" && !Array.isArray(data52)){
for(const key7 in data52){
const _errs142 = errors;
if(typeof data52[key7] !== "string"){
const err80 = {instancePath:instancePath+"/" + i0+"/software/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Evidence/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var valid20 = _errs142 === errors;
if(!valid20){
break;
}
}
}
else {
const err81 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Evidence/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
var valid18 = _errs139 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.kind !== undefined){
let data54 = data0.kind;
const _errs144 = errors;
if(typeof data54 !== "string"){
const err82 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Evidence/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if("evidence" !== data54){
const err83 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Evidence/properties/kind/const",keyword:"const",params:{allowedValue: "evidence"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid18 = _errs144 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.title !== undefined){
const _errs146 = errors;
if(typeof data0.title !== "string"){
const err84 = {instancePath:instancePath+"/" + i0+"/title",schemaPath:"#/$defs/Evidence/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var valid18 = _errs146 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.pdf_key !== undefined){
const _errs148 = errors;
if(typeof data0.pdf_key !== "string"){
const err85 = {instancePath:instancePath+"/" + i0+"/pdf_key",schemaPath:"#/$defs/Evidence/properties/pdf_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var valid18 = _errs148 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.sha256 !== undefined){
const _errs150 = errors;
if(typeof data0.sha256 !== "string"){
const err86 = {instancePath:instancePath+"/" + i0+"/sha256",schemaPath:"#/$defs/Evidence/properties/sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var valid18 = _errs150 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.result !== undefined){
let data58 = data0.result;
const _errs152 = errors;
if(errors === _errs152){
if(data58 && typeof data58 == "object" && !Array.isArray(data58)){
}
else {
const err87 = {instancePath:instancePath+"/" + i0+"/result",schemaPath:"#/$defs/Evidence/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
var valid18 = _errs152 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data0.bundle_key !== undefined){
const _errs155 = errors;
if(typeof data0.bundle_key !== "string"){
const err88 = {instancePath:instancePath+"/" + i0+"/bundle_key",schemaPath:"#/$defs/Evidence/properties/bundle_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid18 = _errs155 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err89 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Evidence/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var _valid0 = _errs123 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid1 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs157 = errors;
const _errs158 = errors;
if(errors === _errs158){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing4;
if(((((((((((((data0.schema_version === undefined) && (missing4 = "schema_version")) || ((data0.id === undefined) && (missing4 = "id"))) || ((data0.project_id === undefined) && (missing4 = "project_id"))) || ((data0.created_at === undefined) && (missing4 = "created_at"))) || ((data0.parents === undefined) && (missing4 = "parents"))) || ((data0.software === undefined) && (missing4 = "software"))) || ((data0.kind === undefined) && (missing4 = "kind"))) || ((data0.benchmark_id === undefined) && (missing4 = "benchmark_id"))) || ((data0.external_project_id === undefined) && (missing4 = "external_project_id"))) || ((data0.external_record_id === undefined) && (missing4 = "external_record_id"))) || ((data0.reason === undefined) && (missing4 = "reason"))) || ((data0.record === undefined) && (missing4 = "record"))){
const err90 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Failure/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
const _errs160 = errors;
for(const key8 in data0){
if(!(func5.call(schema45.properties, key8))){
const err91 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Failure/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
}
if(_errs160 === errors){
if(data0.schema_version !== undefined){
let data60 = data0.schema_version;
const _errs161 = errors;
if(typeof data60 !== "string"){
const err92 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Failure/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if("1.0" !== data60){
const err93 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Failure/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var valid22 = _errs161 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.id !== undefined){
const _errs163 = errors;
if(typeof data0.id !== "string"){
const err94 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Failure/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid22 = _errs163 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.project_id !== undefined){
const _errs165 = errors;
if(typeof data0.project_id !== "string"){
const err95 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Failure/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
var valid22 = _errs165 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.created_at !== undefined){
let data63 = data0.created_at;
const _errs167 = errors;
if(errors === _errs167){
if(errors === _errs167){
if(typeof data63 === "string"){
if(!(formats0.validate(data63))){
const err96 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Failure/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Failure/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
}
var valid22 = _errs167 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.parents !== undefined){
let data64 = data0.parents;
const _errs169 = errors;
if(errors === _errs169){
if(Array.isArray(data64)){
var valid23 = true;
const len6 = data64.length;
for(let i6=0; i6<len6; i6++){
const _errs171 = errors;
if(typeof data64[i6] !== "string"){
const err98 = {instancePath:instancePath+"/" + i0+"/parents/" + i6,schemaPath:"#/$defs/Failure/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
var valid23 = _errs171 === errors;
if(!valid23){
break;
}
}
}
else {
const err99 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Failure/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
var valid22 = _errs169 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.software !== undefined){
let data66 = data0.software;
const _errs173 = errors;
if(errors === _errs173){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
for(const key9 in data66){
const _errs176 = errors;
if(typeof data66[key9] !== "string"){
const err100 = {instancePath:instancePath+"/" + i0+"/software/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Failure/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid24 = _errs176 === errors;
if(!valid24){
break;
}
}
}
else {
const err101 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Failure/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
var valid22 = _errs173 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.kind !== undefined){
let data68 = data0.kind;
const _errs178 = errors;
if(typeof data68 !== "string"){
const err102 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Failure/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if("failure" !== data68){
const err103 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Failure/properties/kind/const",keyword:"const",params:{allowedValue: "failure"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
var valid22 = _errs178 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.benchmark_id !== undefined){
const _errs180 = errors;
if(typeof data0.benchmark_id !== "string"){
const err104 = {instancePath:instancePath+"/" + i0+"/benchmark_id",schemaPath:"#/$defs/Failure/properties/benchmark_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
var valid22 = _errs180 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.external_project_id !== undefined){
const _errs182 = errors;
if(typeof data0.external_project_id !== "string"){
const err105 = {instancePath:instancePath+"/" + i0+"/external_project_id",schemaPath:"#/$defs/Failure/properties/external_project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var valid22 = _errs182 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.external_record_id !== undefined){
const _errs184 = errors;
if(typeof data0.external_record_id !== "string"){
const err106 = {instancePath:instancePath+"/" + i0+"/external_record_id",schemaPath:"#/$defs/Failure/properties/external_record_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var valid22 = _errs184 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.reason !== undefined){
const _errs186 = errors;
if(typeof data0.reason !== "string"){
const err107 = {instancePath:instancePath+"/" + i0+"/reason",schemaPath:"#/$defs/Failure/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var valid22 = _errs186 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data0.record !== undefined){
let data73 = data0.record;
const _errs188 = errors;
if(errors === _errs188){
if(data73 && typeof data73 == "object" && !Array.isArray(data73)){
}
else {
const err108 = {instancePath:instancePath+"/" + i0+"/record",schemaPath:"#/$defs/Failure/properties/record/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
var valid22 = _errs188 === errors;
}
else {
var valid22 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err109 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Failure/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
var _valid0 = _errs157 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid1 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
const _errs191 = errors;
const _errs192 = errors;
if(errors === _errs192){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing5;
if((((((((((((data0.schema_version === undefined) && (missing5 = "schema_version")) || ((data0.id === undefined) && (missing5 = "id"))) || ((data0.project_id === undefined) && (missing5 = "project_id"))) || ((data0.created_at === undefined) && (missing5 = "created_at"))) || ((data0.parents === undefined) && (missing5 = "parents"))) || ((data0.software === undefined) && (missing5 = "software"))) || ((data0.kind === undefined) && (missing5 = "kind"))) || ((data0.activity === undefined) && (missing5 = "activity"))) || ((data0.inputs === undefined) && (missing5 = "inputs"))) || ((data0.outputs === undefined) && (missing5 = "outputs"))) || ((data0.parameters === undefined) && (missing5 = "parameters"))){
const err110 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Provenance/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
else {
const _errs194 = errors;
for(const key10 in data0){
if(!(func5.call(schema46.properties, key10))){
const err111 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Provenance/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
break;
}
}
if(_errs194 === errors){
if(data0.schema_version !== undefined){
let data74 = data0.schema_version;
const _errs195 = errors;
if(typeof data74 !== "string"){
const err112 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Provenance/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if("1.0" !== data74){
const err113 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Provenance/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var valid26 = _errs195 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.id !== undefined){
const _errs197 = errors;
if(typeof data0.id !== "string"){
const err114 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Provenance/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var valid26 = _errs197 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.project_id !== undefined){
const _errs199 = errors;
if(typeof data0.project_id !== "string"){
const err115 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Provenance/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
var valid26 = _errs199 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.created_at !== undefined){
let data77 = data0.created_at;
const _errs201 = errors;
if(errors === _errs201){
if(errors === _errs201){
if(typeof data77 === "string"){
if(!(formats0.validate(data77))){
const err116 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Provenance/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
else {
const err117 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Provenance/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
}
var valid26 = _errs201 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.parents !== undefined){
let data78 = data0.parents;
const _errs203 = errors;
if(errors === _errs203){
if(Array.isArray(data78)){
var valid27 = true;
const len7 = data78.length;
for(let i7=0; i7<len7; i7++){
const _errs205 = errors;
if(typeof data78[i7] !== "string"){
const err118 = {instancePath:instancePath+"/" + i0+"/parents/" + i7,schemaPath:"#/$defs/Provenance/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
var valid27 = _errs205 === errors;
if(!valid27){
break;
}
}
}
else {
const err119 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Provenance/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
var valid26 = _errs203 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.software !== undefined){
let data80 = data0.software;
const _errs207 = errors;
if(errors === _errs207){
if(data80 && typeof data80 == "object" && !Array.isArray(data80)){
for(const key11 in data80){
const _errs210 = errors;
if(typeof data80[key11] !== "string"){
const err120 = {instancePath:instancePath+"/" + i0+"/software/" + key11.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Provenance/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
var valid28 = _errs210 === errors;
if(!valid28){
break;
}
}
}
else {
const err121 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Provenance/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
var valid26 = _errs207 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.kind !== undefined){
let data82 = data0.kind;
const _errs212 = errors;
if(typeof data82 !== "string"){
const err122 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Provenance/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
if("provenance" !== data82){
const err123 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Provenance/properties/kind/const",keyword:"const",params:{allowedValue: "provenance"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var valid26 = _errs212 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.activity !== undefined){
const _errs214 = errors;
if(typeof data0.activity !== "string"){
const err124 = {instancePath:instancePath+"/" + i0+"/activity",schemaPath:"#/$defs/Provenance/properties/activity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
var valid26 = _errs214 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.inputs !== undefined){
let data84 = data0.inputs;
const _errs216 = errors;
if(errors === _errs216){
if(Array.isArray(data84)){
var valid29 = true;
const len8 = data84.length;
for(let i8=0; i8<len8; i8++){
const _errs218 = errors;
if(typeof data84[i8] !== "string"){
const err125 = {instancePath:instancePath+"/" + i0+"/inputs/" + i8,schemaPath:"#/$defs/Provenance/properties/inputs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var valid29 = _errs218 === errors;
if(!valid29){
break;
}
}
}
else {
const err126 = {instancePath:instancePath+"/" + i0+"/inputs",schemaPath:"#/$defs/Provenance/properties/inputs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
var valid26 = _errs216 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.outputs !== undefined){
let data86 = data0.outputs;
const _errs220 = errors;
if(errors === _errs220){
if(Array.isArray(data86)){
var valid30 = true;
const len9 = data86.length;
for(let i9=0; i9<len9; i9++){
const _errs222 = errors;
if(typeof data86[i9] !== "string"){
const err127 = {instancePath:instancePath+"/" + i0+"/outputs/" + i9,schemaPath:"#/$defs/Provenance/properties/outputs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
var valid30 = _errs222 === errors;
if(!valid30){
break;
}
}
}
else {
const err128 = {instancePath:instancePath+"/" + i0+"/outputs",schemaPath:"#/$defs/Provenance/properties/outputs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
var valid26 = _errs220 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data0.parameters !== undefined){
let data88 = data0.parameters;
const _errs224 = errors;
if(errors === _errs224){
if(data88 && typeof data88 == "object" && !Array.isArray(data88)){
}
else {
const err129 = {instancePath:instancePath+"/" + i0+"/parameters",schemaPath:"#/$defs/Provenance/properties/parameters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
var valid26 = _errs224 === errors;
}
else {
var valid26 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err130 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Provenance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
var _valid0 = _errs191 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid1 = true;
passing0 = 6;
if(props0 !== true){
props0 = true;
}
}
const _errs227 = errors;
const _errs228 = errors;
if(errors === _errs228){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing6;
if(((((((((((data0.schema_version === undefined) && (missing6 = "schema_version")) || ((data0.id === undefined) && (missing6 = "id"))) || ((data0.project_id === undefined) && (missing6 = "project_id"))) || ((data0.created_at === undefined) && (missing6 = "created_at"))) || ((data0.parents === undefined) && (missing6 = "parents"))) || ((data0.software === undefined) && (missing6 = "software"))) || ((data0.kind === undefined) && (missing6 = "kind"))) || ((data0.blob_key === undefined) && (missing6 = "blob_key"))) || ((data0.sha256 === undefined) && (missing6 = "sha256"))) || ((data0.artifact_ids === undefined) && (missing6 = "artifact_ids"))){
const err131 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Report/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
else {
const _errs230 = errors;
for(const key12 in data0){
if(!(func5.call(schema47.properties, key12))){
const err132 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Report/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
break;
}
}
if(_errs230 === errors){
if(data0.schema_version !== undefined){
let data89 = data0.schema_version;
const _errs231 = errors;
if(typeof data89 !== "string"){
const err133 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Report/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if("1.0" !== data89){
const err134 = {instancePath:instancePath+"/" + i0+"/schema_version",schemaPath:"#/$defs/Report/properties/schema_version/const",keyword:"const",params:{allowedValue: "1.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
var valid32 = _errs231 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.id !== undefined){
const _errs233 = errors;
if(typeof data0.id !== "string"){
const err135 = {instancePath:instancePath+"/" + i0+"/id",schemaPath:"#/$defs/Report/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var valid32 = _errs233 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.project_id !== undefined){
const _errs235 = errors;
if(typeof data0.project_id !== "string"){
const err136 = {instancePath:instancePath+"/" + i0+"/project_id",schemaPath:"#/$defs/Report/properties/project_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var valid32 = _errs235 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.created_at !== undefined){
let data92 = data0.created_at;
const _errs237 = errors;
if(errors === _errs237){
if(errors === _errs237){
if(typeof data92 === "string"){
if(!(formats0.validate(data92))){
const err137 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Report/properties/created_at/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
else {
const err138 = {instancePath:instancePath+"/" + i0+"/created_at",schemaPath:"#/$defs/Report/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
}
var valid32 = _errs237 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.parents !== undefined){
let data93 = data0.parents;
const _errs239 = errors;
if(errors === _errs239){
if(Array.isArray(data93)){
var valid33 = true;
const len10 = data93.length;
for(let i10=0; i10<len10; i10++){
const _errs241 = errors;
if(typeof data93[i10] !== "string"){
const err139 = {instancePath:instancePath+"/" + i0+"/parents/" + i10,schemaPath:"#/$defs/Report/properties/parents/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
var valid33 = _errs241 === errors;
if(!valid33){
break;
}
}
}
else {
const err140 = {instancePath:instancePath+"/" + i0+"/parents",schemaPath:"#/$defs/Report/properties/parents/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
var valid32 = _errs239 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.software !== undefined){
let data95 = data0.software;
const _errs243 = errors;
if(errors === _errs243){
if(data95 && typeof data95 == "object" && !Array.isArray(data95)){
for(const key13 in data95){
const _errs246 = errors;
if(typeof data95[key13] !== "string"){
const err141 = {instancePath:instancePath+"/" + i0+"/software/" + key13.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Report/properties/software/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
var valid34 = _errs246 === errors;
if(!valid34){
break;
}
}
}
else {
const err142 = {instancePath:instancePath+"/" + i0+"/software",schemaPath:"#/$defs/Report/properties/software/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
var valid32 = _errs243 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.kind !== undefined){
let data97 = data0.kind;
const _errs248 = errors;
if(typeof data97 !== "string"){
const err143 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Report/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if("report" !== data97){
const err144 = {instancePath:instancePath+"/" + i0+"/kind",schemaPath:"#/$defs/Report/properties/kind/const",keyword:"const",params:{allowedValue: "report"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var valid32 = _errs248 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.blob_key !== undefined){
const _errs250 = errors;
if(typeof data0.blob_key !== "string"){
const err145 = {instancePath:instancePath+"/" + i0+"/blob_key",schemaPath:"#/$defs/Report/properties/blob_key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
var valid32 = _errs250 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.sha256 !== undefined){
const _errs252 = errors;
if(typeof data0.sha256 !== "string"){
const err146 = {instancePath:instancePath+"/" + i0+"/sha256",schemaPath:"#/$defs/Report/properties/sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
var valid32 = _errs252 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data0.artifact_ids !== undefined){
let data100 = data0.artifact_ids;
const _errs254 = errors;
if(errors === _errs254){
if(Array.isArray(data100)){
var valid35 = true;
const len11 = data100.length;
for(let i11=0; i11<len11; i11++){
const _errs256 = errors;
if(typeof data100[i11] !== "string"){
const err147 = {instancePath:instancePath+"/" + i0+"/artifact_ids/" + i11,schemaPath:"#/$defs/Report/properties/artifact_ids/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var valid35 = _errs256 === errors;
if(!valid35){
break;
}
}
}
else {
const err148 = {instancePath:instancePath+"/" + i0+"/artifact_ids",schemaPath:"#/$defs/Report/properties/artifact_ids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
var valid32 = _errs254 === errors;
}
else {
var valid32 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
const err149 = {instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/Report/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
var _valid0 = _errs227 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid1 = true;
passing0 = 7;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
}
}
if(!valid1){
const err150 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
validate38.errors = vErrors;
return false;
}
else {
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
}
else {
validate38.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};
