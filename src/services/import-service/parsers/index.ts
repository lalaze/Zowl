import { AlipayBillParser } from "@/services/import-service/parsers/alipay-bill-parser";
import { GenericCsvBillParser } from "@/services/import-service/parsers/generic-csv-bill-parser";
import { WechatBillParser } from "@/services/import-service/parsers/wechat-bill-parser";
import type {
  BillParser,
  FieldMapping,
  ParsedFile,
} from "@/services/import-service/types";

export function resolveBillParser(
  file: ParsedFile,
  mapping?: FieldMapping,
): BillParser {
  const parsers: BillParser[] = [
    new AlipayBillParser(),
    new WechatBillParser(),
    new GenericCsvBillParser(mapping),
  ];
  const parser = parsers.find((candidate) => candidate.canParse(file));

  if (!parser) {
    throw new Error("NO_SUPPORTED_HEADER");
  }

  return parser;
}

export { AlipayBillParser, GenericCsvBillParser, WechatBillParser };
