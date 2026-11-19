/**
 * 表格结构（schema）定义
 * 每张表由一组字段组成，每一行按「字段 ID → 取值」存储。
 * 字段 ID 由程序生成，约定不包含字符 "|"。
 */

export type FieldType = "text" | "number" | "date" | "select" | "attachment";

interface BaseField {
  id: string;
  name: string;
  required?: boolean;
}

export interface TextField extends BaseField {
  type: "text";
}

export interface NumberField extends BaseField {
  type: "number";
}

export interface DateField extends BaseField {
  type: "date";
  includeTime?: boolean;
}

export interface SelectField extends BaseField {
  type: "select";
  options: string[];
}

export interface AttachmentField extends BaseField {
  type: "attachment";
}

export type Field = TextField | NumberField | DateField | SelectField | AttachmentField;

export interface TableSchema {
  id: string;
  name: string;
  fields: Field[];
}

/** 单元格取值：日期统一存 ISO 字符串，附件存文件 ID 列表 */
export type CellValue = string | number | string[] | null;

export interface Row {
  id: string;
  cells: Record<string, CellValue>;
}

export interface ValidationError {
  fieldId: string;
  message: string;
}

/** 写入前校验一行数据是否符合表格结构 */
export function validateRow(schema: TableSchema, cells: Record<string, CellValue>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    const value = cells[field.id] ?? null;

    if (value === null || value === "") {
      if (field.required) errors.push({ fieldId: field.id, message: `${field.name}不能为空` });
      continue;
    }

    let valid: boolean;
    switch (field.type) {
      case "text":
        valid = typeof value === "string";
        break;
      case "number":
        valid = typeof value === "number" && Number.isFinite(value);
        break;
      case "date":
        valid = typeof value === "string" && !Number.isNaN(Date.parse(value));
        break;
      case "select":
        valid = typeof value === "string" && field.options.includes(value);
        break;
      case "attachment":
        valid = Array.isArray(value);
        break;
    }

    if (!valid) errors.push({ fieldId: field.id, message: `${field.name}的格式不正确` });
  }

  return errors;
}

/**
 * 把表格结构转成 JSON Schema。
 * 拍照、语音录入时，把它和内容一起交给多模态模型，让模型按结构化输出直接返回一行数据。
 */
export function toJsonSchema(schema: TableSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of schema.fields) {
    properties[field.id] = fieldToJsonSchema(field);
    if (field.required) required.push(field.id);
  }

  return {
    type: "object",
    title: schema.name,
    properties,
    required,
    additionalProperties: false,
  };
}

function fieldToJsonSchema(field: Field): Record<string, unknown> {
  const description = field.name;
  switch (field.type) {
    case "text":
      return { type: "string", description };
    case "number":
      return { type: "number", description };
    case "date":
      return { type: "string", format: field.includeTime ? "date-time" : "date", description };
    case "select":
      return { type: "string", enum: field.options, description };
    case "attachment":
      return { type: "array", items: { type: "string" }, description };
  }
}
