# uv run python job_agent.py
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

load_dotenv()
model = ChatOpenAI(model="gpt-5.6-luna", reasoning_effort="none") # tools 사용시 none 처리

class JopInfo(BaseModel):
    experience: str = Field(description="요구 경력")
    main: str = Field(description="주요 업무")
    requirement: str = Field(description="자격 요건")
    preferred: str = Field(description="우대사항")

@tool
def search_wanted_jobs(input):
    """원티드에서 채용공고를 검색해서, 스크롤을 내려 찾은 공고 제목과 링크 목록을 반환

       Args:
           input: 짧은 검색 키워드 (예: 백엔드 개발자) - 문장이 아니라 직무명 단어로만
    """
    driver = webdriver.Chrome()
    driver.get(f"https://www.wanted.co.kr/search?query={input}&search_method=direct&tab=position")

    for _ in range(2):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)

    cards = driver.find_elements(By.CSS_SELECTOR, 'a[data-attribute-id="position__click"]')

    results = []

    for card in list(set(cards)):
        title = card.get_attribute("data-position-name")
        link = card.get_attribute("href")
        results.append(f"제목: {title}\n링크: {link}")
    driver.quit()

    return "\n\n".join(results)

@tool
def job_detail(url):
    """채용공고 상세페이지 URL 받아서 주요업무/자격요건/우대사항/요구경력을 구조화해서 반환

    Args:
        url : search_wanted_jobs로 찾은 채용공고 상세페이지 링크
    """
    driver = webdriver.Chrome()
    driver.get(url)

    time.sleep(1)
    btn = driver.find_element(By.XPATH, "//*[contains(text(), '상세 정보 더 보기')]")
    driver.execute_script("arguments[0].click();", btn)

    detail = driver.find_element(By.TAG_NAME, "main")

    model_job = model.with_structured_output(JopInfo)
    result = model_job.invoke(detail.text)
    driver.quit()

    return f"요구경력 : {result.experience}\n주요업무:{result.main}\n자격요건:{result.requirement}\n우대사항:{result.preferred}"


tools = [search_wanted_jobs, job_detail]
tool_dict = {t.name: t for t in tools}
model_tool = model.bind_tools(tools)

messages = [
    SystemMessage("""You are a career agent that searches real Wanted job postings.
    Use search_wanted_jobs to find job titles and links.
    Use job_detail to inspect the selected posting.
    Summarize the results based on the user request."""),
    HumanMessage("Prepare suitable developer job postings for me.")
]

response = model_tool.invoke(messages)
messages.append(response)

print(response.tool_calls)

# 도구를 몇 번 호출할지는 알 수 없음 - GPT가 더 이상 도구를 안 부를 때까지
while response.tool_calls:
    for tool_call in response.tool_calls:
        select_tool = tool_dict[tool_call['name']]
        msg = select_tool.invoke(tool_call)
        messages.append(msg)

    response = model_tool.invoke(messages)
    messages.append(response)

print(response.content)
