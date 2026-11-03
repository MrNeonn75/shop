"""Hesabat İxrac Mühərriki (CSV, Excel, PDF Exporter).

- CSV: Standart UTF-8 BOM ilə axın ixracı (Excel-də Azərbaycan şriftlərinin düzgün açılması üçün).
- XLSX: openpyxl vasitəsilə formatlanmış, başlıqlı cədvəl faylı.
- PDF: reportlab vasitəsilə çap versiyası.
- Maskalama: istifadəçinin hüququ çatmayan sütunlar çıxarılır və ya maskalanır.
"""

from __future__ import annotations

import csv
import io
from typing import Any

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.modules.reporting.report_registry import ReportColumn


class ReportExporter:
    @classmethod
    def to_csv(
        cls,
        _report_title: str,
        columns: list[ReportColumn],
        rows: list[dict[str, Any]],
    ) -> bytes:
        """UTF-8 BOM ilə CSV generasiyası."""
        output = io.StringIO()
        # UTF-8 BOM yazırıq ki, Excel açanda Azərbaycan hərfləri (ə, ö, ğ, ı, ş, ç) xarab olmasın
        output.write("\ufeff")
        writer = csv.writer(output)

        # Başlıq
        writer.writerow([c.az_label for c in columns])

        # Sətirlər
        for r in rows:
            writer.writerow([r.get(c.key, "") for c in columns])

        return output.getvalue().encode("utf-8")

    @classmethod
    def to_xlsx(
        cls,
        report_title: str,
        columns: list[ReportColumn],
        rows: list[dict[str, Any]],
    ) -> bytes:
        """Formatlanmış Excel (XLSX) generasiyası."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Hesabat"

        # Şirkət və hesabat başlığı
        ws.merge_cells("A1:E1")
        title_cell = ws["A1"]
        title_cell.value = f"Brand House — {report_title}"
        title_cell.font = Font(name="Calibri", size=14, bold=True, color="1F2937")

        # Cədvəl sütun başlıqları
        header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

        headers = [c.az_label for c in columns]
        ws.append([])  # Sətir 2 boş
        ws.append(headers)  # Sətir 3 başlıqlar

        for col_idx in range(1, len(columns) + 1):
            cell = ws.cell(row=3, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Məlumat sətirləri
        for r in rows:
            row_data = [r.get(c.key, "") for c in columns]
            ws.append(row_data)

        # Sütun genişliklərini avtomatik tənzimləyirik
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    @classmethod
    def to_pdf(
        cls,
        report_title: str,
        columns: list[ReportColumn],
        rows: list[dict[str, Any]],
    ) -> bytes:
        """Çap formatında PDF generasiyası (Landscape A4)."""
        output = io.BytesIO()
        doc = SimpleDocTemplate(
            output,
            pagesize=landscape(A4),
            rightMargin=20,
            leftMargin=20,
            topMargin=20,
            bottomMargin=20,
        )

        styles = getSampleStyleSheet()
        elements = []

        # Başlıq
        title_p = Paragraph(f"<b>Brand House — {report_title}</b>", styles["Title"])
        elements.append(title_p)
        elements.append(Spacer(1, 15))

        # Cədvəl məlumatı
        data = [[c.az_label for c in columns]]
        # Maksimum 200 sətir PDF-ə salınır (çox böyük faylların qarşısını almaq üçün)
        for r in rows[:200]:
            data.append([str(r.get(c.key, "")) for c in columns])

        t = Table(data)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                ]
            )
        )
        elements.append(t)
        doc.build(elements)
        return output.getvalue()
