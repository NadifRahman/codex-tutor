I will put my thoughts for how we will make the system here. This repo here is a template for one course, and we can make clones for each course as needed

- I want a repo based system, so I will put course materials in here
    - Possible course materials put in
        - Notes from lecture, in pdf format (will always be avaliable)
        - Audio or transcription of the lecture on the notes
        - Notes from students who have taken the course in the past, like https://jsprcrz.github.io/Notes/
        - The textbook of the course
        - Course assignments and labs
        - Past midterms/exams for the entire course
        - Homework questions

- How I want the system to work (requirements)
    - Each week we have new material to learn, so there will be notes for them
        - I will put in the material for each week which can be read by the AI
    - There will also be the course outline and course exams for the entire course
    - Essentially I want codex or the agent to be my professor and teach me the slides from scratch like im learning
    the course for the first time. So not just making summarizing notes, but actually walking me through the course material
    - I want each slide to be explained slide by slide, in detial. Not summarization each slide, but actually explaining it to me like a teacher
    - As the AI teaches me, I want it to make notes for each week, perhaps in latex?
    - I also want the AI to ask me questions for comprehension
    - I want the AI to look into the midterm and exams to know what to teach me in particular, because the goal is to do the exams well



Workflow 
    - I put the materials in for the week
    - I prompt the AI agent (perhaps codex) to teach me the material
    - The AI teaches me slide by slide as a teacher, talks to me about comprehension and makes sure I understand
    - The AI needs to make notes for each slide as we go, so it needs to be able to extract text from PDF slides (might need OCR) and also needs to extract images too
        - In the notes, it needs put the slide and then its explanation underneath it. So each week, we'll have a like chapter in a book where we go slide and by slide with the AI's explanation
    - I should be able to ask questions at any point for the AI to explain, and the AI should explain to me and then also update the notes
    - 