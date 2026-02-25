#!/usr/bin/env python3
"""Generate a PDF of all questions organized by category, season, and match day."""

import os
import sys
import sqlite3
from collections import defaultdict

from fpdf import FPDF

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend', 'trivia.db')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'll_trivia_questions.pdf')


FONT_DIR = 'C:/Windows/Fonts'


class TriviaQPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)
        self.current_category = ""
        # Register Unicode TTF fonts
        self.add_font('Arial', '', os.path.join(FONT_DIR, 'arial.ttf'), uni=True)
        self.add_font('Arial', 'B', os.path.join(FONT_DIR, 'arialbd.ttf'), uni=True)
        self.add_font('Arial', 'I', os.path.join(FONT_DIR, 'ariali.ttf'), uni=True)

    def header(self):
        if self.page_no() > 1 and self.current_category:
            self.set_font('Arial', 'I', 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, f'{self.current_category}', align='L')
            self.cell(0, 5, f'Page {self.page_no()}', align='R', new_x='LMARGIN', new_y='NEXT')
            self.ln(2)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'LearnedLeague Seasons 60-107  |  Page {self.page_no()}',
                  align='C')

    def category_title(self, category, count):
        self.add_page()
        self.current_category = category
        self.set_font('Arial', 'B', 24)
        self.set_text_color(30, 60, 120)
        self.cell(0, 15, category, new_x='LMARGIN', new_y='NEXT')
        self.set_font('Arial', '', 11)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f'{count} questions', new_x='LMARGIN', new_y='NEXT')
        self.set_draw_color(30, 60, 120)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(8)

    def season_heading(self, season):
        if self.get_y() > 260:
            self.add_page()
        self.set_font('Arial', 'B', 14)
        self.set_text_color(60, 60, 60)
        self.cell(0, 10, f'Season {season}', new_x='LMARGIN', new_y='NEXT')
        self.set_draw_color(180, 180, 180)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def match_day_heading(self, match_day):
        if self.get_y() > 265:
            self.add_page()
        self.set_font('Arial', 'B', 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 7, f'Match Day {match_day}', new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

    def question_entry(self, q_num, question_text, answer, percent_correct):
        if self.get_y() > 255:
            self.add_page()

        # Difficulty indicator
        if percent_correct is not None:
            if percent_correct >= 70:
                diff_color = (46, 139, 87)    # green - easy
            elif percent_correct >= 30:
                diff_color = (200, 150, 30)   # amber - medium
            else:
                diff_color = (180, 40, 40)    # red - hard
            pct_str = f'{percent_correct:.0f}%'
        else:
            diff_color = (150, 150, 150)
            pct_str = '—'

        x_start = self.get_x()

        # Question number + difficulty badge
        self.set_font('Arial', 'B', 9)
        self.set_text_color(*diff_color)
        self.cell(8, 5, f'Q{q_num}', new_x='END')
        self.set_font('Arial', '', 7)
        self.cell(14, 5, f'({pct_str})', new_x='END')

        # Question text
        self.set_font('Arial', '', 9)
        self.set_text_color(30, 30, 30)
        q_width = 168
        x_q = self.get_x()
        y_q = self.get_y()
        self.multi_cell(q_width, 4.5, question_text, new_x='LMARGIN', new_y='NEXT')

        # Answer
        self.set_x(x_start + 22)
        self.set_font('Arial', 'B', 9)
        self.set_text_color(30, 60, 120)
        self.cell(5, 5, 'A:', new_x='END')
        self.set_font('Arial', '', 9)
        self.multi_cell(163, 4.5, f' {answer}', new_x='LMARGIN', new_y='NEXT')
        self.ln(3)


def main():
    conn = sqlite3.connect(os.path.abspath(DB_PATH))
    c = conn.cursor()

    # Get all non-AI questions ordered by category, season, match_day, question_number
    c.execute('''
        SELECT category, season, match_day, question_number,
               question_text, answer, percent_correct
        FROM questions
        WHERE season > 0
        ORDER BY category, season, match_day, question_number
    ''')
    rows = c.fetchall()
    conn.close()

    # Organize: category -> season -> match_day -> [questions]
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    cat_counts = defaultdict(int)

    for cat, season, md, qnum, qtext, answer, pct in rows:
        data[cat][season][md].append((qnum, qtext, answer, pct))
        cat_counts[cat] += 1

    # Sort categories alphabetically
    sorted_categories = sorted(data.keys())

    print(f"Generating PDF for {len(rows)} questions across {len(sorted_categories)} categories...")

    pdf = TriviaQPDF()
    pdf.set_title('LearnedLeague Trivia - Seasons 60-107')
    pdf.set_author('LL Trivia Study App')

    # Title page
    pdf.add_page()
    pdf.ln(60)
    pdf.set_font('Arial', 'B', 32)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 15, 'LearnedLeague Trivia', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Arial', '', 18)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 12, 'Seasons 60 - 107', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(10)
    pdf.set_font('Arial', '', 12)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, f'{len(rows)} Questions', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 8, 'Organized by Category, Season, and Match Day', align='C',
             new_x='LMARGIN', new_y='NEXT')
    pdf.ln(20)

    # Table of contents
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 10, 'Categories', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(5)
    pdf.set_font('Arial', '', 11)
    pdf.set_text_color(50, 50, 50)
    for cat in sorted_categories:
        pdf.cell(100, 7, f'    {cat}', new_x='END')
        pdf.cell(0, 7, f'{cat_counts[cat]} questions', new_x='LMARGIN', new_y='NEXT')

    # Generate pages per category
    for cat in sorted_categories:
        print(f"  {cat} ({cat_counts[cat]} questions)...")
        pdf.category_title(cat, cat_counts[cat])

        seasons = sorted(data[cat].keys())
        for season in seasons:
            pdf.season_heading(season)
            match_days = sorted(data[cat][season].keys())
            for md in match_days:
                pdf.match_day_heading(md)
                for qnum, qtext, answer, pct in data[cat][season][md]:
                    pdf.question_entry(qnum, qtext, answer, pct)

    output_path = os.path.abspath(OUTPUT_PATH)
    pdf.output(output_path)
    print(f"\nPDF saved to: {output_path}")
    print(f"Pages: {pdf.page_no()}")


if __name__ == '__main__':
    main()
